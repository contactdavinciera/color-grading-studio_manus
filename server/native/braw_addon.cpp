/*
 * Blackmagic RAW Node.js Native Addon
 * 
 * High-performance N-API addon for BRAW processing
 * Based on official Blackmagic RAW SDK
 */

#include <napi.h>
#include "BlackmagicRawAPI.h"
#include <string>
#include <cstring>

// Resource format for frame extraction
static const BlackmagicRawResourceFormat s_resourceFormat = blackmagicRawResourceFormatRGBAU8;

// Callback implementation for frame extraction
class BRAWCallback : public IBlackmagicRawCallback
{
public:
    BRAWCallback() : processed_image(nullptr), error_occurred(false) {}
    virtual ~BRAWCallback() {
        if (processed_image) {
            processed_image->Release();
        }
    }

    IBlackmagicRawProcessedImage* processed_image;
    bool error_occurred;

    virtual void ReadComplete(IBlackmagicRawJob* readJob, HRESULT result, IBlackmagicRawFrame* frame)
    {
        IBlackmagicRawJob* decodeAndProcessJob = nullptr;

        if (result == S_OK)
            result = frame->SetResourceFormat(s_resourceFormat);

        if (result == S_OK)
            result = frame->CreateJobDecodeAndProcessFrame(nullptr, nullptr, &decodeAndProcessJob);

        if (result == S_OK)
            result = decodeAndProcessJob->Submit();

        if (result != S_OK)
        {
            error_occurred = true;
            if (decodeAndProcessJob)
                decodeAndProcessJob->Release();
        }

        readJob->Release();
    }

    virtual void ProcessComplete(IBlackmagicRawJob* job, HRESULT result, IBlackmagicRawProcessedImage* processedImage)
    {
        if (result != S_OK) {
            error_occurred = true;
            job->Release();
            return;
        }

        // Store the processed image
        if (processed_image) {
            processed_image->Release();
        }
        processed_image = processedImage;
        processed_image->AddRef();

        job->Release();
    }

    virtual void DecodeComplete(IBlackmagicRawJob*, HRESULT) {}
    virtual void TrimProgress(IBlackmagicRawJob*, float) {}
    virtual void TrimComplete(IBlackmagicRawJob*, HRESULT) {}
    virtual void SidecarMetadataParseWarning(IBlackmagicRawClip*, const char*, uint32_t, const char*) {}
    virtual void SidecarMetadataParseError(IBlackmagicRawClip*, const char*, uint32_t, const char*) {}
    virtual void PreparePipelineComplete(void*, HRESULT) {}

    virtual HRESULT STDMETHODCALLTYPE QueryInterface(REFIID, LPVOID*)
    {
        return E_NOTIMPL;
    }

    virtual ULONG STDMETHODCALLTYPE AddRef(void)
    {
        return 0;
    }

    virtual ULONG STDMETHODCALLTYPE Release(void)
    {
        return 0;
    }
};

/**
 * Extract metadata from BRAW file
 * 
 * @param {string} filePath - Path to BRAW file
 * @returns {object} Metadata object with frame_count, width, height, frame_rate, duration
 */
Napi::Object ExtractMetadata(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Validate arguments
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "String expected for file path").ThrowAsJavaScriptException();
        return Napi::Object::New(env);
    }

    std::string filePath = info[0].As<Napi::String>().Utf8Value();

    HRESULT result = S_OK;
    IBlackmagicRawFactory* factory = nullptr;
    IBlackmagicRaw* codec = nullptr;
    IBlackmagicRawClip* clip = nullptr;

    Napi::Object metadata = Napi::Object::New(env);

    do
    {
        factory = CreateBlackmagicRawFactoryInstanceFromPath("/usr/local/lib");
        if (!factory)
        {
            metadata.Set("success", false);
            metadata.Set("error", "Failed to create factory");
            break;
        }

        result = factory->CreateCodec(&codec);
        if (result != S_OK)
        {
            metadata.Set("success", false);
            metadata.Set("error", "Failed to create codec");
            break;
        }

        result = codec->OpenClip(filePath.c_str(), &clip);
        if (result != S_OK)
        {
            metadata.Set("success", false);
            metadata.Set("error", "Failed to open clip");
            break;
        }

        // Get metadata
        uint64_t frame_count = 0;
        unsigned int width = 0;
        unsigned int height = 0;
        float frame_rate = 0.0f;

        clip->GetFrameCount(&frame_count);
        clip->GetWidth(&width);
        clip->GetHeight(&height);
        clip->GetFrameRate(&frame_rate);

        // Build result object
        metadata.Set("success", true);
        metadata.Set("frame_count", Napi::Number::New(env, static_cast<double>(frame_count)));
        metadata.Set("width", Napi::Number::New(env, width));
        metadata.Set("height", Napi::Number::New(env, height));
        metadata.Set("frame_rate", Napi::Number::New(env, frame_rate));
        metadata.Set("duration", Napi::Number::New(env, frame_count / frame_rate));

    } while(0);

    if (clip != nullptr)
        clip->Release();
    if (codec != nullptr)
        codec->Release();
    if (factory != nullptr)
        factory->Release();

    return metadata;
}

/**
 * Extract a single frame from BRAW file as RGBA buffer
 * 
 * @param {string} filePath - Path to BRAW file
 * @param {number} frameIndex - Frame index to extract
 * @returns {object} Object with success, width, height, and buffer (Uint8Array)
 */
Napi::Object ExtractFrame(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Validate arguments
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "Expected (string filePath, number frameIndex)").ThrowAsJavaScriptException();
        return Napi::Object::New(env);
    }

    std::string filePath = info[0].As<Napi::String>().Utf8Value();
    long frameIndex = info[1].As<Napi::Number>().Int64Value();

    HRESULT result = S_OK;
    IBlackmagicRawFactory* factory = nullptr;
    IBlackmagicRaw* codec = nullptr;
    IBlackmagicRawClip* clip = nullptr;
    IBlackmagicRawJob* readJob = nullptr;
    BRAWCallback callback;

    Napi::Object resultObj = Napi::Object::New(env);

    do
    {
        factory = CreateBlackmagicRawFactoryInstanceFromPath("/usr/local/lib");
        if (!factory)
        {
            resultObj.Set("success", false);
            resultObj.Set("error", "Failed to create factory");
            break;
        }

        result = factory->CreateCodec(&codec);
        if (result != S_OK)
        {
            resultObj.Set("success", false);
            resultObj.Set("error", "Failed to create codec");
            break;
        }

        result = codec->OpenClip(filePath.c_str(), &clip);
        if (result != S_OK)
        {
            resultObj.Set("success", false);
            resultObj.Set("error", "Failed to open clip");
            break;
        }

        // Verify frame index
        uint64_t frame_count = 0;
        clip->GetFrameCount(&frame_count);
        if (frameIndex < 0 || frameIndex >= (long)frame_count)
        {
            resultObj.Set("success", false);
            resultObj.Set("error", "Frame index out of range");
            result = E_FAIL;
            break;
        }

        result = codec->SetCallback(&callback);
        if (result != S_OK)
        {
            resultObj.Set("success", false);
            resultObj.Set("error", "Failed to set callback");
            break;
        }

        result = clip->CreateJobReadFrame(frameIndex, &readJob);
        if (result != S_OK)
        {
            resultObj.Set("success", false);
            resultObj.Set("error", "Failed to create read job");
            break;
        }

        result = readJob->Submit();
        if (result != S_OK)
        {
            readJob->Release();
            resultObj.Set("success", false);
            resultObj.Set("error", "Failed to submit job");
            break;
        }

        codec->FlushJobs();

        // Check for errors
        if (callback.error_occurred)
        {
            resultObj.Set("success", false);
            resultObj.Set("error", "Processing error occurred");
            result = E_FAIL;
            break;
        }

        // Check if we got the image
        if (!callback.processed_image)
        {
            resultObj.Set("success", false);
            resultObj.Set("error", "No processed image received");
            result = E_FAIL;
            break;
        }

        // Get image dimensions
        unsigned int width = 0;
        unsigned int height = 0;
        callback.processed_image->GetWidth(&width);
        callback.processed_image->GetHeight(&height);

        // Get resource type
        BlackmagicRawResourceType resourceType;
        callback.processed_image->GetResourceType(&resourceType);
        
        if (resourceType != blackmagicRawResourceTypeBufferCPU)
        {
            resultObj.Set("success", false);
            resultObj.Set("error", "Unexpected resource type");
            result = E_FAIL;
            break;
        }

        // Get image data
        void* imageData = nullptr;
        result = callback.processed_image->GetResource(&imageData);
        if (result != S_OK || !imageData)
        {
            resultObj.Set("success", false);
            resultObj.Set("error", "Failed to get image data");
            break;
        }

        // Create Node.js Buffer from image data
        size_t bufferSize = width * height * 4; // RGBA
        Napi::Buffer<uint8_t> buffer = Napi::Buffer<uint8_t>::Copy(env, static_cast<uint8_t*>(imageData), bufferSize);

        // Build result object
        resultObj.Set("success", true);
        resultObj.Set("width", Napi::Number::New(env, width));
        resultObj.Set("height", Napi::Number::New(env, height));
        resultObj.Set("buffer", buffer);

    } while(0);

    if (clip != nullptr)
        clip->Release();
    if (codec != nullptr)
        codec->Release();
    if (factory != nullptr)
        factory->Release();

    return resultObj;
}

/**
 * Initialize the addon
 */
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(
        Napi::String::New(env, "extractMetadata"),
        Napi::Function::New(env, ExtractMetadata)
    );
    
    exports.Set(
        Napi::String::New(env, "extractFrame"),
        Napi::Function::New(env, ExtractFrame)
    );

    return exports;
}

NODE_API_MODULE(braw, Init)


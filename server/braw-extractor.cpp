/*
 * BRAW Frame Extractor - Based on official Blackmagic SDK example
 * 
 * Usage:
 *   braw-extractor metadata <input.braw>
 *   braw-extractor extract <input.braw> <frame_index> <output.ppm>
 */

#include "BlackmagicRawAPI.h"
#include <stdio.h>
#include <iostream>
#include <string>
#include <cstring>

using namespace std;

// Output format
static const BlackmagicRawResourceFormat s_resourceFormat = blackmagicRawResourceFormatRGBAU8;

// Global output path for extracted frame
static string g_output_path;
static unsigned int g_output_width = 0;
static unsigned int g_output_height = 0;
static bool g_output_success = false;

// Write RGBA data as PPM (simple uncompressed format)
bool write_ppm(const char* filename, unsigned int width, unsigned int height, const void* data)
{
    FILE* file = fopen(filename, "wb");
    if (!file) {
        cerr << "Failed to open output file: " << filename << endl;
        return false;
    }

    // Write PPM header
    fprintf(file, "P6\n%u %u\n255\n", width, height);

    // Convert RGBA to RGB and write
    const unsigned char* rgba = static_cast<const unsigned char*>(data);
    for (unsigned int i = 0; i < width * height; i++) {
        fputc(rgba[i * 4 + 0], file); // R
        fputc(rgba[i * 4 + 1], file); // G
        fputc(rgba[i * 4 + 2], file); // B
        // Skip alpha channel
    }

    fclose(file);
    return true;
}

// Callback implementation (based on official example)
class CameraCodecCallback : public IBlackmagicRawCallback
{
public:
    explicit CameraCodecCallback() = default;
    virtual ~CameraCodecCallback() = default;

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
            if (decodeAndProcessJob)
                decodeAndProcessJob->Release();
        }

        readJob->Release();
    }

    virtual void ProcessComplete(IBlackmagicRawJob* job, HRESULT result, IBlackmagicRawProcessedImage* processedImage)
    {
        unsigned int width = 0;
        unsigned int height = 0;
        void* imageData = nullptr;

        if (result == S_OK)
            result = processedImage->GetWidth(&width);

        if (result == S_OK)
            result = processedImage->GetHeight(&height);

        if (result == S_OK)
            result = processedImage->GetResource(&imageData);

        if (result == S_OK)
        {
            g_output_width = width;
            g_output_height = height;
            g_output_success = write_ppm(g_output_path.c_str(), width, height, imageData);
        }

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

int extract_metadata(const char* input_path)
{
    HRESULT result = S_OK;
    IBlackmagicRawFactory* factory = nullptr;
    IBlackmagicRaw* codec = nullptr;
    IBlackmagicRawClip* clip = nullptr;

    do
    {
        factory = CreateBlackmagicRawFactoryInstanceFromPath("/usr/local/lib");
        if (!factory)
        {
            cerr << "{\"error\": \"Failed to create factory\"}" << endl;
            break;
        }

        result = factory->CreateCodec(&codec);
        if (result != S_OK)
        {
            cerr << "{\"error\": \"Failed to create codec\"}" << endl;
            break;
        }

        result = codec->OpenClip(input_path, &clip);
        if (result != S_OK)
        {
            cerr << "{\"error\": \"Failed to open clip\"}" << endl;
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

        // Output as JSON
        cout << "{" << endl;
        cout << "  \"success\": true," << endl;
        cout << "  \"frame_count\": " << frame_count << "," << endl;
        cout << "  \"width\": " << width << "," << endl;
        cout << "  \"height\": " << height << "," << endl;
        cout << "  \"frame_rate\": " << frame_rate << "," << endl;
        cout << "  \"duration\": " << (frame_count / frame_rate) << endl;
        cout << "}" << endl;

    } while(0);

    if (clip != nullptr)
        clip->Release();
    if (codec != nullptr)
        codec->Release();
    if (factory != nullptr)
        factory->Release();

    return result == S_OK ? 0 : 1;
}

int extract_frame(const char* input_path, long frame_index, const char* output_path)
{
    HRESULT result = S_OK;
    IBlackmagicRawFactory* factory = nullptr;
    IBlackmagicRaw* codec = nullptr;
    IBlackmagicRawClip* clip = nullptr;
    IBlackmagicRawJob* readJob = nullptr;
    CameraCodecCallback callback;

    // Set global output path
    g_output_path = output_path;
    g_output_success = false;

    do
    {
        factory = CreateBlackmagicRawFactoryInstanceFromPath("/usr/local/lib");
        if (!factory)
        {
            cerr << "{\"error\": \"Failed to create factory\"}" << endl;
            break;
        }

        result = factory->CreateCodec(&codec);
        if (result != S_OK)
        {
            cerr << "{\"error\": \"Failed to create codec\"}" << endl;
            break;
        }

        result = codec->OpenClip(input_path, &clip);
        if (result != S_OK)
        {
            cerr << "{\"error\": \"Failed to open clip\"}" << endl;
            break;
        }

        // Verify frame index
        uint64_t frame_count = 0;
        clip->GetFrameCount(&frame_count);
        if (frame_index < 0 || frame_index >= (long)frame_count)
        {
            cerr << "{\"error\": \"Frame " << frame_index << " out of range (0-" << (frame_count-1) << ")\"}" << endl;
            result = E_FAIL;
            break;
        }

        result = codec->SetCallback(&callback);
        if (result != S_OK)
        {
            cerr << "{\"error\": \"Failed to set callback\"}" << endl;
            break;
        }

        result = clip->CreateJobReadFrame(frame_index, &readJob);
        if (result != S_OK)
        {
            cerr << "{\"error\": \"Failed to create read job\"}" << endl;
            break;
        }

        result = readJob->Submit();
        if (result != S_OK)
        {
            readJob->Release();
            cerr << "{\"error\": \"Failed to submit job\"}" << endl;
            break;
        }

        codec->FlushJobs();

        // Check if output was successful
        if (g_output_success)
        {
            cout << "{" << endl;
            cout << "  \"success\": true," << endl;
            cout << "  \"path\": \"" << output_path << "\"," << endl;
            cout << "  \"width\": " << g_output_width << "," << endl;
            cout << "  \"height\": " << g_output_height << endl;
            cout << "}" << endl;
        }
        else
        {
            cerr << "{\"error\": \"Failed to write output file\"}" << endl;
            result = E_FAIL;
        }

    } while(0);

    if (clip != nullptr)
        clip->Release();
    if (codec != nullptr)
        codec->Release();
    if (factory != nullptr)
        factory->Release();

    return result == S_OK ? 0 : 1;
}

int main(int argc, char* argv[])
{
    if (argc < 3)
    {
        cerr << "Usage:" << endl;
        cerr << "  " << argv[0] << " metadata <input.braw>" << endl;
        cerr << "  " << argv[0] << " extract <input.braw> <frame_index> <output.ppm>" << endl;
        return 1;
    }

    string command = argv[1];

    if (command == "metadata")
    {
        if (argc != 3)
        {
            cerr << "Usage: " << argv[0] << " metadata <input.braw>" << endl;
            return 1;
        }
        return extract_metadata(argv[2]);
    }
    else if (command == "extract")
    {
        if (argc != 5)
        {
            cerr << "Usage: " << argv[0] << " extract <input.braw> <frame_index> <output.ppm>" << endl;
            return 1;
        }
        long frame_index = atol(argv[3]);
        return extract_frame(argv[2], frame_index, argv[4]);
    }
    else
    {
        cerr << "Unknown command: " << command << endl;
        return 1;
    }
}


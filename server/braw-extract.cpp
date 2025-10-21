/*
 * BRAW Frame Extractor
 * 
 * Standalone C++ utility for extracting frames and metadata from
 * Blackmagic RAW files using the official SDK.
 * 
 * Usage:
 *   braw-extract metadata <input.braw>
 *   braw-extract extract <input.braw> <frame_index> <output.jpg>
 */

#include <iostream>
#include <fstream>
#include <cstring>
#include <cstdlib>
#include <BlackmagicRAW/BlackmagicRawAPI.h>

using namespace std;

// Simple callback implementation based on openfx-braw
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
        if (result != S_OK) {
            cerr << "ReadComplete failed with result: " << result << endl;
            error_occurred = true;
            readJob->Release();
            return;
        }

        // Set resource format to RGBA U8
        result = frame->SetResourceFormat(blackmagicRawResourceFormatRGBAU8);
        if (result != S_OK) {
            cerr << "SetResourceFormat failed" << endl;
            error_occurred = true;
            readJob->Release();
            return;
        }

        // Create decode and process job
        IBlackmagicRawJob* decodeJob = nullptr;
        result = frame->CreateJobDecodeAndProcessFrame(nullptr, nullptr, &decodeJob);
        if (result != S_OK) {
            cerr << "CreateJobDecodeAndProcessFrame failed" << endl;
            error_occurred = true;
            readJob->Release();
            return;
        }

        // Submit the decode job
        result = decodeJob->Submit();
        if (result != S_OK) {
            cerr << "Submit decode job failed" << endl;
            error_occurred = true;
        }

        decodeJob->Release();
        readJob->Release();
    }

    virtual void ProcessComplete(IBlackmagicRawJob* job, HRESULT result, IBlackmagicRawProcessedImage* processedImage)
    {
        if (result != S_OK) {
            cerr << "ProcessComplete failed with result: " << result << endl;
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
    
    virtual HRESULT STDMETHODCALLTYPE QueryInterface(REFIID, LPVOID*) { return E_NOTIMPL; }
    virtual ULONG STDMETHODCALLTYPE AddRef(void) { return 0; }
    virtual ULONG STDMETHODCALLTYPE Release(void) { return 0; }
};

// Write RGBA data as PPM (simple uncompressed format)
bool write_ppm(const char* filename, unsigned int width, unsigned int height, const void* data)
{
    ofstream file(filename, ios::binary);
    if (!file.is_open()) {
        cerr << "Failed to open output file: " << filename << endl;
        return false;
    }

    // Write PPM header
    file << "P6\n" << width << " " << height << "\n255\n";

    // Convert RGBA to RGB and write
    const unsigned char* rgba = static_cast<const unsigned char*>(data);
    for (unsigned int i = 0; i < width * height; i++) {
        file.put(rgba[i * 4 + 0]); // R
        file.put(rgba[i * 4 + 1]); // G
        file.put(rgba[i * 4 + 2]); // B
        // Skip alpha channel
    }

    file.close();
    return true;
}

int extract_metadata(const char* input_path)
{
    HRESULT result;
    IBlackmagicRawFactory* factory = nullptr;
    IBlackmagicRaw* codec = nullptr;
    IBlackmagicRawClip* clip = nullptr;

    // Create factory
    factory = CreateBlackmagicRawFactoryInstanceFromPath("/usr/local/lib");
    if (!factory) {
        cerr << "{\"error\": \"Failed to create factory\"}" << endl;
        return 1;
    }

    // Create codec
    result = factory->CreateCodec(&codec);
    if (result != S_OK || !codec) {
        cerr << "{\"error\": \"Failed to create codec\"}" << endl;
        factory->Release();
        return 1;
    }

    // Open clip
    result = codec->OpenClip(input_path, &clip);
    if (result != S_OK || !clip) {
        cerr << "{\"error\": \"Failed to open clip: " << input_path << "\"}" << endl;
        codec->Release();
        factory->Release();
        return 1;
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

    // Cleanup
    clip->Release();
    codec->Release();
    factory->Release();

    return 0;
}

// Global callback instance
static BRAWCallback* g_callback = nullptr;

int extract_frame(const char* input_path, int frame_index, const char* output_path)
{
    HRESULT result;
    IBlackmagicRawFactory* factory = nullptr;
    IBlackmagicRaw* codec = nullptr;
    IBlackmagicRawClip* clip = nullptr;
    
    // Create callback on heap to keep it alive
    if (g_callback) {
        delete g_callback;
    }
    g_callback = new BRAWCallback();
    BRAWCallback& callback = *g_callback;

    // Create factory
    factory = CreateBlackmagicRawFactoryInstanceFromPath("/usr/local/lib");
    if (!factory) {
        cerr << "{\"error\": \"Failed to create factory\"}" << endl;
        return 1;
    }

    // Create codec
    result = factory->CreateCodec(&codec);
    if (result != S_OK || !codec) {
        cerr << "{\"error\": \"Failed to create codec\"}" << endl;
        factory->Release();
        return 1;
    }

    // Open clip
    result = codec->OpenClip(input_path, &clip);
    if (result != S_OK || !clip) {
        cerr << "{\"error\": \"Failed to open clip\"}" << endl;
        codec->Release();
        factory->Release();
        return 1;
    }

    // Verify frame index
    uint64_t frame_count = 0;
    clip->GetFrameCount(&frame_count);
    if (frame_index < 0 || frame_index >= (int)frame_count) {
        cerr << "{\"error\": \"Frame " << frame_index << " out of range (0-" << (frame_count-1) << ")\"}" << endl;
        clip->Release();
        codec->Release();
        factory->Release();
        return 1;
    }

    // Set callback
    result = codec->SetCallback(g_callback);
    if (result != S_OK) {
        cerr << "{\"error\": \"Failed to set callback: " << hex << result << "\"}" << endl;
        clip->Release();
        codec->Release();
        factory->Release();
        return 1;
    }

    // Create read job
    IBlackmagicRawJob* readJob = nullptr;
    result = clip->CreateJobReadFrame(frame_index, &readJob);
    if (result != S_OK || !readJob) {
        cerr << "{\"error\": \"Failed to create read job\"}" << endl;
        clip->Release();
        codec->Release();
        factory->Release();
        return 1;
    }

    // Submit job
    result = readJob->Submit();
    if (result != S_OK) {
        cerr << "{\"error\": \"Failed to submit job\"}" << endl;
        readJob->Release();
        clip->Release();
        codec->Release();
        factory->Release();
        return 1;
    }

    readJob->Release();

    // Wait for processing to complete
    result = codec->FlushJobs();
    if (result != S_OK) {
        cerr << "{\"error\": \"FlushJobs failed\"}" << endl;
        clip->Release();
        codec->Release();
        factory->Release();
        return 1;
    }

    // Check for errors
    if (callback.error_occurred) {
        cerr << "{\"error\": \"Processing error occurred\"}" << endl;
        clip->Release();
        codec->Release();
        factory->Release();
        return 1;
    }

    // Check if we got the image
    if (!callback.processed_image) {
        cerr << "{\"error\": \"No processed image received\"}" << endl;
        clip->Release();
        codec->Release();
        factory->Release();
        return 1;
    }

    // Get image dimensions
    unsigned int width = 0;
    unsigned int height = 0;
    callback.processed_image->GetWidth(&width);
    callback.processed_image->GetHeight(&height);

    // Get resource type
    BlackmagicRawResourceType resourceType;
    callback.processed_image->GetResourceType(&resourceType);
    
    if (resourceType != blackmagicRawResourceTypeBufferCPU) {
        cerr << "{\"error\": \"Unexpected resource type\"}" << endl;
        clip->Release();
        codec->Release();
        factory->Release();
        return 1;
    }

    // Get image data
    void* imageData = nullptr;
    result = callback.processed_image->GetResource(&imageData);
    if (result != S_OK || !imageData) {
        cerr << "{\"error\": \"Failed to get image data\"}" << endl;
        clip->Release();
        codec->Release();
        factory->Release();
        return 1;
    }

    // Write to PPM file
    if (!write_ppm(output_path, width, height, imageData)) {
        cerr << "{\"error\": \"Failed to write output file\"}" << endl;
        clip->Release();
        codec->Release();
        factory->Release();
        return 1;
    }

    // Output success JSON
    cout << "{" << endl;
    cout << "  \"success\": true," << endl;
    cout << "  \"path\": \"" << output_path << "\"," << endl;
    cout << "  \"width\": " << width << "," << endl;
    cout << "  \"height\": " << height << endl;
    cout << "}" << endl;

    // Cleanup
    clip->Release();
    codec->Release();
    factory->Release();

    return 0;
}

int main(int argc, char* argv[])
{
    if (argc < 3) {
        cerr << "Usage:" << endl;
        cerr << "  " << argv[0] << " metadata <input.braw>" << endl;
        cerr << "  " << argv[0] << " extract <input.braw> <frame_index> <output.ppm>" << endl;
        return 1;
    }

    string command = argv[1];

    if (command == "metadata") {
        if (argc != 3) {
            cerr << "Usage: " << argv[0] << " metadata <input.braw>" << endl;
            return 1;
        }
        return extract_metadata(argv[2]);
    }
    else if (command == "extract") {
        if (argc != 5) {
            cerr << "Usage: " << argv[0] << " extract <input.braw> <frame_index> <output.ppm>" << endl;
            return 1;
        }
        int frame_index = atoi(argv[3]);
        return extract_frame(argv[2], frame_index, argv[4]);
    }
    else {
        cerr << "Unknown command: " << command << endl;
        return 1;
    }
}


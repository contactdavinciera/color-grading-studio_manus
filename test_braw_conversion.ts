import { getBRAWProcessor } from "./server/brawProcessor";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";

async function testBRAWConversion(brawFilePath: string) {
  console.log(`Starting BRAW conversion test for: ${brawFilePath}`);

  const fileId = path.basename(brawFilePath, path.extname(brawFilePath));
    const outputVideoPath = path.join(process.cwd(), `temp/${fileId}.mp4`);
    // Remove existing output file if it exists
    try {
      await fs.unlink(outputVideoPath);
    } catch (e) {
      // Ignore if file does not exist
    }
    // Ensure the temp/braw-uploads directory exists
    await fs.mkdir(path.join(process.cwd(), 'temp', 'braw-uploads'), { recursive: true });

  const tempDir = path.join(process.cwd(), 'temp');

  try {
    await fs.mkdir(tempDir, { recursive: true });

    const processor = await getBRAWProcessor();
    // Assume the BRAW file is already in the temp/braw-uploads directory or accessible by fileId
    // For this isolated test, we'll need to ensure the processor can find the file.
    // Let's copy the test file to the expected location for the processor.
    const processorUploadPath = path.join(process.cwd(), 'temp', 'braw-uploads', path.basename(brawFilePath));
    await fs.copyFile(brawFilePath, processorUploadPath);

    const info = await processor.getInfo(fileId);
    const fps = info.fps || 24;
    const totalFrames = info.frameCount || Math.ceil(info.duration * fps);

    const ffmpegArgs = [
      '-f', 'rawvideo',
      '-pix_fmt', 'bgra', // BRAW native output is BGRA (4 channels)
      '-s', `${info.width}x${info.height}`,
      '-r', `${fps}`,
      '-i', 'pipe:0', // Input from stdin
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-pix_fmt', 'yuv420p', // Output pixel format for H.264 compatibility
      '-movflags', 'faststart',
      outputVideoPath,
      
      // Overwrite output file without asking
      '-y',
    ];

    console.log(`Starting FFmpeg with args: ${ffmpegArgs.join(' ')}`);
    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

    let ffmpegStderr = '';
    ffmpegProcess.stderr.on('data', (data) => {
      ffmpegStderr += data.toString();
      console.error(`FFmpeg STDERR: ${data.toString()}`);
    });

    ffmpegProcess.on('error', (err) => {
      console.error(`FFmpeg process error: ${err.message}`);
    });

    ffmpegProcess.on('close', async (code) => {
      if (code === 0) {
        console.log(`FFmpeg conversion completed successfully for ${fileId}`);
      } else {
        console.error(`FFmpeg conversion failed for ${fileId} with code ${code}. Stderr: ${ffmpegStderr}`);
      }
      // Clean up the copied BRAW file
      await fs.unlink(processorUploadPath);
      console.log(`Cleaned up temporary BRAW file: ${processorUploadPath}`);
    });

    let currentFrame = 0;
    const extractAndPipeFrame = async () => {
      if (currentFrame < totalFrames) {
        try {
          console.log(`Extracting frame ${currentFrame + 1}/${totalFrames} for ${fileId}`);
          const frameBuffer = await processor.extractFrame({
            fileId,
            timestamp: currentFrame / fps,
            quality: 'high',
          });

          console.log(`Extracted frame buffer length: ${frameBuffer ? frameBuffer.length : 'undefined'}`);
          const canWrite = ffmpegProcess.stdin.write(frameBuffer);

          if (!canWrite) {
            console.log(`FFmpeg stdin buffer full. Pausing frame extraction.`);
            ffmpegProcess.stdin.once('drain', () => {
              console.log(`FFmpeg stdin drained. Resuming frame extraction.`);
              currentFrame++;
              extractAndPipeFrame();
            });
          } else {
            currentFrame++;
            extractAndPipeFrame();
          }
        } catch (frameError) {
          console.error(`Error extracting frame ${currentFrame} for ${fileId}: ${frameError}`);
          ffmpegProcess.stdin.end();
        }
      } else {
        console.log(`All frames extracted for ${fileId}. Ending FFmpeg stdin.`);
        ffmpegProcess.stdin.end();
      }
    };

    extractAndPipeFrame();

  } catch (error) {
    console.error('Failed to start conversion test:', error);
  }
}

// Usage: Pass the path to your BRAW test file
testBRAWConversion(process.argv[2]).catch(console.error);


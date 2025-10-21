import { extractMetadata, extractFrameBuffer } from './braw';
import path from 'path';
import fs from 'fs/promises';

async function testBRAWNative() {
  console.log('Starting native BRAW module test...');
  
  // Use a fixed BRAW file path for testing
  const tempDir = path.join(process.cwd(), '..', 'temp', 'braw-uploads');
  const fixedFileId = '0d019782b4635f11f343b15fab7a9c48'; // Using one of the file IDs found earlier
  const filePath = path.join(tempDir, `${fixedFileId}.braw`);

  try {
    await fs.access(filePath);
    console.log(`Using BRAW file for test: ${filePath}`);
  } catch (error) {
    console.error(`Error accessing BRAW file at ${filePath}:`, error);
    console.error('Please ensure a BRAW file with the ID 0d019782b4635f11f343b15fab7a9c48.braw exists in temp/braw-uploads.');
    process.exit(1);
  }

  try {
    console.log(`Testing metadata extraction for: ${filePath}`);
    const metadata = extractMetadata(filePath);
    console.log('Metadata extracted:', metadata);

    if (!metadata.success) {
      throw new Error(`Metadata extraction failed: ${metadata.error}`);
    }

    console.log(`Testing frame extraction for frame 0 at quality 'high'`);
    const frameBuffer = await extractFrameBuffer(filePath, 0, { quality: 95, format: 'jpeg' });
    console.log(`Frame 0 extracted successfully. Size: ${frameBuffer.length} bytes`);
    await fs.writeFile(path.join(process.cwd(), 'test_frame_0.jpg'), frameBuffer);
    console.log('Saved test_frame_0.jpg');

    // Test another frame if duration allows
    if (metadata.duration > 1) {
      const frameIndex = Math.floor(metadata.frame_rate);
      console.log(`Testing frame extraction for frame ${frameIndex} (1 second mark)`);
      const frameBuffer2 = await extractFrameBuffer(filePath, frameIndex, { quality: 95, format: 'jpeg' });
      console.log(`Frame ${frameIndex} extracted successfully. Size: ${frameBuffer2.length} bytes`);
      await fs.writeFile(path.join(process.cwd(), 'test_frame_1s.jpg'), frameBuffer2);
      console.log('Saved test_frame_1s.jpg');
    }

    console.log('Native BRAW module test completed successfully.');
  } catch (error) {
    console.error('Native BRAW module test failed:', error);
    process.exit(1);
  }
}

testBRAWNative();


import { BRAWProcessor, getBRAWProcessor } from './brawProcessor';
import { extractMetadata, extractFrameBuffer } from './braw';

async function runTests() {
    const testFile = '/home/ubuntu/color-grading-studio/temp/braw-uploads/0d019782b4635f11f343b15fab7a9c48.braw';

    console.log('--- Running Metadata Test ---');
    const metadata = extractMetadata(testFile);
    console.log(metadata);

    console.log('--- Running Frame Extraction Test ---');
    const frame = await extractFrameBuffer(testFile, 0, { format: 'jpeg', quality: 90 });
    console.log(`Extracted frame size: ${frame.length}`);

    console.log('--- Running Processor Test ---');
    const processor = await getBRAWProcessor();
    const info = await processor.getInfo('0d019782b4635f11f343b15fab7a9c48');
    console.log(info);
    const frameFromProcessor = await processor.extractFrame({ fileId: '0d019782b4635f11f343b15fab7a9c48', timestamp: 0 });
    console.log(`Extracted frame from processor size: ${frameFromProcessor.length}`);
}

runTests().catch(console.error);


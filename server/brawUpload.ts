import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { getBRAWProcessor } from './brawProcessor';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import { EventEmitter } from 'events';

const conversionEvents = new EventEmitter();

const router = Router();

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    cb(null, path.join(process.cwd(), 'temp', 'braw-uploads'));
  },
  filename: async (req, file, cb) => {
    const processor = await getBRAWProcessor();
    const fileId = await processor.generateFileId();
    const ext = path.extname(file.originalname);
    cb(null, `${fileId}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB limit
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.braw', '.r3d', '.arriraw', '.dng', '.cr2', '.cr3', '.nef', '.arw'];
    
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${ext}`));
    }
  },
});

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const processor = await getBRAWProcessor();
    
    const fileId = path.basename(req.file.filename, path.extname(req.file.filename));
    
    const info = await processor.getInfo(fileId);
    
    console.log(`[BRAW Upload] File uploaded: ${fileId} (${req.file.size} bytes)`);
    
    res.json({
      success: true,
      fileId,
      info,
      fileName: req.file.originalname,
      size: req.file.size,
    });
  } catch (error) {
    console.error('[BRAW Upload] Error:', error);
    res.status(500).json({
      error: 'Failed to process BRAW file',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/frame/:fileId/:timestamp', async (req, res) => {
  try {
    const { fileId, timestamp } = req.params;
    const quality = (req.query.quality as 'low' | 'medium' | 'high') || 'medium';
    
    const processor = await getBRAWProcessor();
    const frameBuffer = await processor.extractFrame({
      fileId,
      timestamp: parseFloat(timestamp),
      quality,
    });
    
    res.contentType('image/jpeg');
    res.send(frameBuffer);
  } catch (error) {
    console.error('[BRAW Frame] Error:', error);
    res.status(500).json({
      error: 'Failed to extract frame',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/convert-progress/:fileId', (req, res) => {
  const { fileId } = req.params;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const progressHandler = (data: { fileId: string; progress: number; current: number; total: number }) => {
    if (data.fileId === fileId) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };
  
  const completeHandler = (data: { fileId: string; success: boolean; videoPath?: string; error?: string }) => {
    if (data.fileId === fileId) {
      res.write(`data: ${JSON.stringify({ ...data, complete: true })}\n\n`);
      res.end();
    }
  };
  
  conversionEvents.on('progress', progressHandler);
  conversionEvents.on('complete', completeHandler);
  
  req.on('close', () => {
    conversionEvents.off('progress', progressHandler);
    conversionEvents.off('complete', completeHandler);
  });
});

router.post("/convert/:fileId", async (req, res) => {
  console.log(`[BRAW Convert] Received conversion request for fileId: ${req.params.fileId}`);
  try {
    const { fileId } = req.params;
    const processor = await getBRAWProcessor();

    const info = await processor.getInfo(fileId);
    const fps = info.fps || 24;
    const totalFrames = info.frameCount || Math.ceil(info.duration * fps);
    const outputVideoPath = path.join(process.cwd(), 'temp', 'braw-uploads', `${fileId}.mp4`);

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
    ];

    console.log(`[BRAW Convert] Starting FFmpeg with args: ${ffmpegArgs.join(' ')}`);
    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

    let ffmpegStderr = '';
    ffmpegProcess.stderr.on('data', (data) => {
      ffmpegStderr += data.toString();
    });

    ffmpegProcess.on('error', (err) => {
      console.error(`[BRAW Convert] FFmpeg process error: ${err.message}`);
      conversionEvents.emit('complete', { fileId, success: false, error: `FFmpeg process error: ${err.message}` });
    });

    ffmpegProcess.on('close', async (code) => {
      if (code === 0) {
        console.log(`[BRAW Convert] FFmpeg conversion completed successfully for ${fileId}`);
        conversionEvents.emit('complete', { fileId, success: true, videoPath: `/api/braw/video/${fileId}` });
      } else {
        console.error(`[BRAW Convert] FFmpeg conversion failed for ${fileId} with code ${code}. Stderr: ${ffmpegStderr}`);
        conversionEvents.emit('complete', { fileId, success: false, error: `FFmpeg conversion failed. Code: ${code}, Stderr: ${ffmpegStderr}` });
      }
    });

    let currentFrame = 0;
    const extractAndPipeFrame = async () => {
      if (currentFrame < totalFrames) {
        try {
          console.log(`[BRAW Convert] Extracting frame ${currentFrame + 1}/${totalFrames} for ${fileId}`);
          const frameBuffer = await processor.extractFrame({
            fileId,
            timestamp: currentFrame / fps,
            quality: 'high',
          });

          const canWrite = ffmpegProcess.stdin.write(frameBuffer);

          if (!canWrite) {
            console.log(`[BRAW Convert] FFmpeg stdin buffer full. Pausing frame extraction.`);
            ffmpegProcess.stdin.once('drain', () => {
              console.log(`[BRAW Convert] FFmpeg stdin drained. Resuming frame extraction.`);
              currentFrame++;
              conversionEvents.emit('progress', { fileId, progress: (currentFrame / totalFrames) * 100, current: currentFrame, total: totalFrames });
              extractAndPipeFrame();
            });
          } else {
            currentFrame++;
            conversionEvents.emit('progress', { fileId, progress: (currentFrame / totalFrames) * 100, current: currentFrame, total: totalFrames });
            extractAndPipeFrame();
          }
        } catch (frameError) {
          console.error(`[BRAW Convert] Error extracting frame ${currentFrame} for ${fileId}: ${frameError}`);
          ffmpegProcess.stdin.end();
          conversionEvents.emit('complete', { fileId, success: false, error: `Error extracting frame ${currentFrame}: ${frameError}` });
        }
      } else {
        console.log(`[BRAW Convert] All frames extracted for ${fileId}. Ending FFmpeg stdin.`);
        ffmpegProcess.stdin.end();
      }
    };

    extractAndPipeFrame();

    res.json({ success: true, message: 'Conversion started' });
  } catch (error) {
    console.error('[BRAW Convert] Error:', error);
    res.status(500).json({
      error: 'Failed to start conversion',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/video/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const videoPath = path.join(process.cwd(), 'temp', 'braw-uploads', `${fileId}.mp4`);
    
    const stat = await fs.stat(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = await fs.open(videoPath, 'r');
      const stream = file.createReadStream({ start, end });
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      });
      
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      });
      
      const file = await fs.open(videoPath, 'r');
      const stream = file.createReadStream();
      stream.pipe(res);
    }
  } catch (error) {
    console.error('[BRAW Video] Error:', error);
    res.status(404).json({
      error: 'Video not found',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.delete('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const processor = await getBRAWProcessor();
    await processor.cleanup(fileId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[BRAW Cleanup] Error:', error);
    res.status(500).json({
      error: 'Failed to cleanup BRAW file',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

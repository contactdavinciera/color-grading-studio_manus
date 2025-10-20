import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { getBRAWProcessor } from './brawProcessor';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const processor = await getBRAWProcessor();
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

/**
 * POST /api/braw/upload
 * Upload BRAW file (multipart/form-data)
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const processor = await getBRAWProcessor();
    
    // Extract fileId from filename
    const fileId = path.basename(req.file.filename, path.extname(req.file.filename));
    
    // Get file info
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

/**
 * GET /api/braw/frame/:fileId/:timestamp
 * Get frame at specific timestamp
 */
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

/**
 * DELETE /api/braw/:fileId
 * Cleanup BRAW file and cache
 */
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


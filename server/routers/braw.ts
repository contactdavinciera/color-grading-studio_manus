import { z } from 'zod';
import { publicProcedure, router } from '../_core/trpc';
import { getBRAWProcessor } from '../brawProcessor';
import { TRPCError } from '@trpc/server';

export const brawRouter = router({
  /**
   * Get presigned URL for direct S3 upload
   */
  getUploadUrl: publicProcedure
    .input(
      z.object({
        fileName: z.string(),
        fileSize: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const processor = await getBRAWProcessor();
        const fileId = await processor.generateFileId();
        const uploadPath = `braw-uploads/${fileId}/${input.fileName}`;
        
        // Generate presigned URL for upload
        const { storagePut } = await import('../storage');
        
        return {
          fileId,
          uploadPath,
          // For now, client will upload via file input and we'll process from there
          // In production, use presigned S3 URL
        };
      } catch (error) {
        console.error('[BRAW API] Get upload URL failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate upload URL',
        });
      }
    }),
  /**
   * Upload BRAW file
   */
  upload: publicProcedure
    .input(
      z.object({
        fileName: z.string(),
        fileData: z.string(), // base64 encoded
      })
    )
    .mutation(async ({ input }) => {
      try {
        const processor = await getBRAWProcessor();
        const buffer = Buffer.from(input.fileData, 'base64');
        const fileId = await processor.saveUpload(buffer, input.fileName);
        
        // Get file info
        const info = await processor.getInfo(fileId);
        
        return {
          fileId,
          info,
        };
      } catch (error) {
        console.error('[BRAW API] Upload failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to upload BRAW file',
        });
      }
    }),

  /**
   * Get BRAW file info
   */
  getInfo: publicProcedure
    .input(
      z.object({
        fileId: z.string(),
      })
    )
    .query(async ({ input }) => {
      try {
        const processor = await getBRAWProcessor();
        const info = await processor.getInfo(input.fileId);
        return info;
      } catch (error) {
        console.error('[BRAW API] Get info failed:', error);
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'BRAW file not found',
        });
      }
    }),

  /**
   * Extract frame at timestamp
   */
  extractFrame: publicProcedure
    .input(
      z.object({
        fileId: z.string(),
        timestamp: z.number(),
        quality: z.enum(['low', 'medium', 'high']).optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const processor = await getBRAWProcessor();
        const frameBuffer = await processor.extractFrame({
          fileId: input.fileId,
          timestamp: input.timestamp,
          quality: input.quality,
        });
        
        // Return as base64
        return {
          data: frameBuffer.toString('base64'),
          timestamp: input.timestamp,
        };
      } catch (error) {
        console.error('[BRAW API] Extract frame failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to extract frame',
        });
      }
    }),

  /**
   * Extract multiple frames for buffering
   */
  extractFrames: publicProcedure
    .input(
      z.object({
        fileId: z.string(),
        timestamps: z.array(z.number()),
        quality: z.enum(['low', 'medium', 'high']).optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const processor = await getBRAWProcessor();
        const frames = await processor.extractFrames(
          input.fileId,
          input.timestamps,
          input.quality
        );
        
        // Convert to array of base64
        const result = Array.from(frames.entries()).map(([timestamp, buffer]) => ({
          timestamp,
          data: buffer.toString('base64'),
        }));
        
        return result;
      } catch (error) {
        console.error('[BRAW API] Extract frames failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to extract frames',
        });
      }
    }),

  /**
   * Cleanup BRAW file and cache
   */
  cleanup: publicProcedure
    .input(
      z.object({
        fileId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const processor = await getBRAWProcessor();
        await processor.cleanup(input.fileId);
        return { success: true };
      } catch (error) {
        console.error('[BRAW API] Cleanup failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to cleanup BRAW file',
        });
      }
    }),
});


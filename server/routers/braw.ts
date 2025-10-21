import { publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getBRAWProcessor } from "../brawProcessor";
import { TRPCError } from "@trpc/server";

export const brawRouter = router({


  getInfo: publicProcedure
    .input(
      z.object({
        fileId: z.string(),
      })
    )
    .query(async ({ input }) => {
      try {
        const processor = await getBRAWProcessor();
        return await processor.getInfo(input.fileId);
      } catch (error) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "BRAW file not found",
        });
      }
    }),

  extractFrame: publicProcedure
    .input(
      z.object({
        fileId: z.string(),
        timestamp: z.number(),
        quality: z.enum(["low", "medium", "high"]).optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const processor = await getBRAWProcessor();
        const buffer = await processor.extractFrame(input);
        return {
          data: buffer.toString("base64"),
          timestamp: input.timestamp,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to extract frame",
        });
      }
    }),

  extractFrames: publicProcedure
    .input(
      z.object({
        fileId: z.string(),
        timestamps: z.array(z.number()),
        quality: z.enum(["low", "medium", "high"]).optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const processor = await getBRAWProcessor();
        const frames = await Promise.all(
          input.timestamps.map((timestamp) =>
            processor.extractFrame({ ...input, timestamp })
          )
        );
        return frames.map((buffer, i) => ({
          timestamp: input.timestamps[i],
          data: buffer.toString("base64"),
        }));
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to extract frames",
        });
      }
    }),

  cleanup: publicProcedure
    .input(z.object({ fileId: z.string() }))
    .mutation(async ({ input }) => {
      const processor = await getBRAWProcessor();
      await processor.cleanup(input.fileId);
      return { success: true };
    }),

  getCacheStats: publicProcedure.query(async () => {
    const processor = await getBRAWProcessor();
    return processor.getCacheStats();
  }),
});


/**
 * BRAW Frame Cache Manager
 * 
 * Intelligent caching system with LRU eviction, disk persistence,
 * and memory management for BRAW frame extraction
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export interface CacheEntry {
  key: string;
  fileId: string;
  timestamp: number;
  quality: 'low' | 'medium' | 'high';
  size: number;
  accessCount: number;
  lastAccess: number;
  createdAt: number;
}

export interface CacheStats {
  totalFrames: number;
  totalSize: number;
  memoryFrames: number;
  diskFrames: number;
  hitRate: number;
  hitCount: number;
  missCount: number;
  evictionCount: number;
}

/**
 * Intelligent BRAW Frame Cache
 * 
 * Features:
 * - Memory cache with LRU eviction
 * - Disk cache for persistence
 * - Configurable size limits
 * - Access tracking and statistics
 * - Automatic cleanup
 */
export class BRAWCache {
  private memoryCache: Map<string, { buffer: Buffer; entry: CacheEntry }> = new Map();
  private diskCacheDir: string;
  private maxMemorySize: number; // in bytes
  private maxDiskSize: number; // in bytes
  private currentMemorySize: number = 0;
  private currentDiskSize: number = 0;
  
  // Statistics
  private hitCount: number = 0;
  private missCount: number = 0;
  private evictionCount: number = 0;

  constructor(diskCacheDir: string, maxMemoryMB: number = 500, maxDiskMB: number = 5000) {
    this.diskCacheDir = diskCacheDir;
    this.maxMemorySize = maxMemoryMB * 1024 * 1024;
    this.maxDiskSize = maxDiskMB * 1024 * 1024;
  }

  /**
   * Initialize cache directories
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.diskCacheDir, { recursive: true });
    console.log(`[BRAW Cache] Initialized (Memory: ${this.maxMemorySize / 1024 / 1024}MB, Disk: ${this.maxDiskSize / 1024 / 1024}MB)`);
  }

  /**
   * Generate cache key
   */
  private generateKey(fileId: string, timestamp: number, quality: string): string {
    return `${fileId}_${timestamp}_${quality}`;
  }

  /**
   * Get frame from cache (memory first, then disk)
   */
  async get(fileId: string, timestamp: number, quality: 'low' | 'medium' | 'high'): Promise<Buffer | null> {
    const key = this.generateKey(fileId, timestamp, quality);

    // Check memory cache
    if (this.memoryCache.has(key)) {
      const { buffer, entry } = this.memoryCache.get(key)!;
      entry.accessCount++;
      entry.lastAccess = Date.now();
      this.hitCount++;
      console.log(`[BRAW Cache] Memory hit: ${key}`);
      return buffer;
    }

    // Check disk cache
    const diskPath = path.join(this.diskCacheDir, `${key}.jpg`);
    try {
      const buffer = await fs.readFile(diskPath);
      
      // Move to memory cache
      const entry: CacheEntry = {
        key,
        fileId,
        timestamp,
        quality,
        size: buffer.length,
        accessCount: 1,
        lastAccess: Date.now(),
        createdAt: Date.now(),
      };
      
      this.memoryCache.set(key, { buffer, entry });
      this.currentMemorySize += buffer.length;
      
      // Evict if necessary
      await this.evictIfNeeded();
      
      this.hitCount++;
      console.log(`[BRAW Cache] Disk hit: ${key}`);
      return buffer;
    } catch {
      // Not in cache
      this.missCount++;
      return null;
    }
  }

  /**
   * Set frame in cache (memory + disk)
   */
  async set(fileId: string, timestamp: number, quality: 'low' | 'medium' | 'high', buffer: Buffer): Promise<void> {
    const key = this.generateKey(fileId, timestamp, quality);

    // Create cache entry
    const entry: CacheEntry = {
      key,
      fileId,
      timestamp,
      quality,
      size: buffer.length,
      accessCount: 0,
      lastAccess: Date.now(),
      createdAt: Date.now(),
    };

    // Add to memory cache
    this.memoryCache.set(key, { buffer, entry });
    this.currentMemorySize += buffer.length;

    // Save to disk cache
    const diskPath = path.join(this.diskCacheDir, `${key}.jpg`);
    await fs.writeFile(diskPath, buffer);
    this.currentDiskSize += buffer.length;

    // Evict if necessary
    await this.evictIfNeeded();

    console.log(`[BRAW Cache] Cached: ${key} (${buffer.length} bytes)`);
  }

  /**
   * Evict entries if cache is full
   */
  private async evictIfNeeded(): Promise<void> {
    // Evict from memory if needed
    while (this.currentMemorySize > this.maxMemorySize && this.memoryCache.size > 0) {
      const lruKey = this.findLRUKey();
      if (lruKey) {
        const { entry } = this.memoryCache.get(lruKey)!;
        this.memoryCache.delete(lruKey);
        this.currentMemorySize -= entry.size;
        this.evictionCount++;
        console.log(`[BRAW Cache] Evicted from memory: ${lruKey}`);
      }
    }

    // Evict from disk if needed
    while (this.currentDiskSize > this.maxDiskSize) {
      const files = await fs.readdir(this.diskCacheDir);
      if (files.length === 0) break;

      // Find oldest file
      let oldestFile = files[0];
      let oldestTime = (await fs.stat(path.join(this.diskCacheDir, oldestFile))).mtime.getTime();

      for (const file of files) {
        const stat = await fs.stat(path.join(this.diskCacheDir, file));
        if (stat.mtime.getTime() < oldestTime) {
          oldestFile = file;
          oldestTime = stat.mtime.getTime();
        }
      }

      const filePath = path.join(this.diskCacheDir, oldestFile);
      const stat = await fs.stat(filePath);
      await fs.unlink(filePath);
      this.currentDiskSize -= stat.size;
      this.evictionCount++;
      console.log(`[BRAW Cache] Evicted from disk: ${oldestFile}`);
    }
  }

  /**
   * Find LRU (Least Recently Used) key in memory cache
   */
  private findLRUKey(): string | null {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, { entry }] of Array.from(this.memoryCache.entries())) {
      if (entry.lastAccess < lruTime) {
        lruTime = entry.lastAccess;
        lruKey = key;
      }
    }

    return lruKey;
  }

  /**
   * Clear cache for specific file
   */
  async clearFile(fileId: string): Promise<void> {
    // Remove from memory cache
    const keysToDelete = Array.from(this.memoryCache.keys()).filter(key => key.startsWith(fileId));
    for (const key of keysToDelete) {
      const { entry } = this.memoryCache.get(key)!;
      this.memoryCache.delete(key);
      this.currentMemorySize -= entry.size;
    }

    // Remove from disk cache
    const files = await fs.readdir(this.diskCacheDir);
    for (const file of files) {
      if (file.startsWith(fileId)) {
        const filePath = path.join(this.diskCacheDir, file);
        const stat = await fs.stat(filePath);
        await fs.unlink(filePath);
        this.currentDiskSize -= stat.size;
      }
    }

    console.log(`[BRAW Cache] Cleared cache for file: ${fileId}`);
  }

  /**
   * Clear all cache
   */
  async clearAll(): Promise<void> {
    this.memoryCache.clear();
    this.currentMemorySize = 0;

    const files = await fs.readdir(this.diskCacheDir);
    for (const file of files) {
      await fs.unlink(path.join(this.diskCacheDir, file));
    }
    this.currentDiskSize = 0;

    console.log('[BRAW Cache] Cleared all cache');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalFrames = this.memoryCache.size + (this.currentDiskSize > 0 ? 1 : 0); // Rough estimate for disk
    
    return {
      totalFrames,
      totalSize: this.currentMemorySize + this.currentDiskSize,
      memoryFrames: this.memoryCache.size,
      diskFrames: Math.ceil(this.currentDiskSize / (1024 * 1024)), // Rough estimate
      hitRate: this.hitCount + this.missCount > 0 ? this.hitCount / (this.hitCount + this.missCount) : 0,
      hitCount: this.hitCount,
      missCount: this.missCount,
      evictionCount: this.evictionCount,
    };
  }

  /**
   * Get memory usage info
   */
  getMemoryInfo(): {
    used: number;
    max: number;
    percentage: number;
  } {
    return {
      used: this.currentMemorySize,
      max: this.maxMemorySize,
      percentage: (this.currentMemorySize / this.maxMemorySize) * 100,
    };
  }

  /**
   * Get disk usage info
   */
  getDiskInfo(): {
    used: number;
    max: number;
    percentage: number;
  } {
    return {
      used: this.currentDiskSize,
      max: this.maxDiskSize,
      percentage: (this.currentDiskSize / this.maxDiskSize) * 100,
    };
  }
}

// Singleton instance
let cacheInstance: BRAWCache | null = null;

/**
 * Get or create BRAW cache instance
 */
export async function getBRAWCache(diskCacheDir: string): Promise<BRAWCache> {
  if (!cacheInstance) {
    cacheInstance = new BRAWCache(diskCacheDir);
    await cacheInstance.initialize();
  }
  return cacheInstance;
}


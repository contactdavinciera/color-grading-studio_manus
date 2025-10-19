/**
 * Multi-Layer Cache Manager for Color Grading Studio
 * Implements intelligent caching strategy for rendered frames
 * 
 * Cache Layers:
 * 1. Memory Cache (fastest, limited size)
 * 2. IndexedDB (fast, browser storage ~1GB+)
 * 3. File System API (user-selected fast drive, unlimited)
 */

export interface CacheConfig {
  memoryCacheSize: number;      // MB
  indexedDBCacheSize: number;   // MB
  enableFileSystemCache: boolean;
  compressionLevel: number;     // 0-9
}

export interface CachedFrame {
  id: string;
  timestamp: number;
  data: ImageData | Blob;
  size: number;
  nodeHash: string;  // Hash of node configuration
}

export class CacheManager {
  private memoryCache: Map<string, CachedFrame> = new Map();
  private memoryCacheSize: number = 0;
  private maxMemoryCacheSize: number;
  
  private dbName = 'ColorGradingCache';
  private db: IDBDatabase | null = null;
  
  private fileSystemHandle: FileSystemDirectoryHandle | null = null;
  private config: CacheConfig;
  
  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      memoryCacheSize: config.memoryCacheSize ?? 512, // 512MB default
      indexedDBCacheSize: config.indexedDBCacheSize ?? 2048, // 2GB default
      enableFileSystemCache: config.enableFileSystemCache ?? false,
      compressionLevel: config.compressionLevel ?? 6,
    };
    
    this.maxMemoryCacheSize = this.config.memoryCacheSize * 1024 * 1024;
  }
  
  /**
   * Initialize cache system
   */
  async initialize(): Promise<void> {
    await this.initIndexedDB();
    
    // Try to restore file system handle from previous session
    if (this.config.enableFileSystemCache) {
      await this.restoreFileSystemHandle();
    }
  }
  
  /**
   * Initialize IndexedDB
   */
  private async initIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('frames')) {
          const store = db.createObjectStore('frames', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('nodeHash', 'nodeHash', { unique: false });
        }
      };
    });
  }
  
  /**
   * Request user to select cache directory
   */
  async requestFileSystemCache(): Promise<boolean> {
    try {
      // Check if File System Access API is supported
      if (!('showDirectoryPicker' in window)) {
        console.warn('File System Access API not supported');
        return false;
      }
      
      // @ts-ignore - File System Access API
      this.fileSystemHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads',
      });
      
      // Store handle for future sessions (if supported)
      if (this.fileSystemHandle) {
        await this.saveFileSystemHandle();
        this.config.enableFileSystemCache = true;
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to request file system cache:', error);
      return false;
    }
  }
  
  /**
   * Save file system handle to IndexedDB for persistence
   */
  private async saveFileSystemHandle(): Promise<void> {
    if (!this.fileSystemHandle || !this.db) return;
    
    try {
      const transaction = this.db.transaction(['frames'], 'readwrite');
      const store = transaction.objectStore('frames');
      
      await store.put({
        id: '__file_system_handle__',
        handle: this.fileSystemHandle,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to save file system handle:', error);
    }
  }
  
  /**
   * Restore file system handle from previous session
   */
  private async restoreFileSystemHandle(): Promise<void> {
    if (!this.db) return;
    
    try {
      const transaction = this.db.transaction(['frames'], 'readonly');
      const store = transaction.objectStore('frames');
      const request = store.get('__file_system_handle__');
      
      await new Promise((resolve, reject) => {
        request.onsuccess = async () => {
          const result = request.result;
          if (result?.handle) {
            this.fileSystemHandle = result.handle;
            
            // Verify we still have permission
            try {
              // @ts-ignore - queryPermission may not be in all browsers
              const permission = await this.fileSystemHandle?.queryPermission?.({ mode: 'readwrite' });
              if (permission !== 'granted') {
                // @ts-ignore
                const newPermission = await this.fileSystemHandle?.requestPermission?.({ mode: 'readwrite' });
                if (newPermission !== 'granted') {
                  this.fileSystemHandle = null;
                }
              }
            } catch {
              // Permission API not supported, assume granted
            }
          }
          resolve(null);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to restore file system handle:', error);
      this.fileSystemHandle = null;
    }
  }
  
  /**
   * Get cached frame (checks all layers)
   */
  async get(id: string): Promise<CachedFrame | null> {
    // Layer 1: Memory cache
    const memoryFrame = this.memoryCache.get(id);
    if (memoryFrame) {
      return memoryFrame;
    }
    
    // Layer 2: IndexedDB
    const dbFrame = await this.getFromIndexedDB(id);
    if (dbFrame) {
      // Promote to memory cache if there's space
      this.addToMemoryCache(dbFrame);
      return dbFrame;
    }
    
    // Layer 3: File system
    if (this.config.enableFileSystemCache && this.fileSystemHandle) {
      const fsFrame = await this.getFromFileSystem(id);
      if (fsFrame) {
        // Promote to memory cache
        this.addToMemoryCache(fsFrame);
        return fsFrame;
      }
    }
    
    return null;
  }
  
  /**
   * Set cached frame (writes to all enabled layers)
   */
  async set(frame: CachedFrame): Promise<void> {
    // Layer 1: Memory cache
    this.addToMemoryCache(frame);
    
    // Layer 2: IndexedDB
    await this.setToIndexedDB(frame);
    
    // Layer 3: File system (async, don't wait)
    if (this.config.enableFileSystemCache && this.fileSystemHandle) {
      this.setToFileSystem(frame).catch(err => 
        console.error('Failed to write to file system cache:', err)
      );
    }
  }
  
  /**
   * Add frame to memory cache with LRU eviction
   */
  private addToMemoryCache(frame: CachedFrame): void {
    // Check if we need to evict
    while (this.memoryCacheSize + frame.size > this.maxMemoryCacheSize && this.memoryCache.size > 0) {
      // Evict oldest entry
      const oldestKey = this.memoryCache.keys().next().value as string | undefined;
      if (oldestKey) {
        const oldestFrame = this.memoryCache.get(oldestKey);
        if (oldestFrame) {
          this.memoryCacheSize -= oldestFrame.size;
          this.memoryCache.delete(oldestKey);
        }
      } else {
        break;
      }
    }
    
    this.memoryCache.set(frame.id, frame);
    this.memoryCacheSize += frame.size;
  }
  
  /**
   * Get frame from IndexedDB
   */
  private async getFromIndexedDB(id: string): Promise<CachedFrame | null> {
    if (!this.db) return null;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['frames'], 'readonly');
      const store = transaction.objectStore('frames');
      const request = store.get(id);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * Set frame to IndexedDB
   */
  private async setToIndexedDB(frame: CachedFrame): Promise<void> {
    if (!this.db) return;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['frames'], 'readwrite');
      const store = transaction.objectStore('frames');
      const request = store.put(frame);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * Get frame from file system
   */
  private async getFromFileSystem(id: string): Promise<CachedFrame | null> {
    if (!this.fileSystemHandle) return null;
    
    try {
      const fileName = `${id}.cache`;
      const fileHandle = await this.fileSystemHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const data = await file.arrayBuffer();
      
      // Decompress and parse
      const decompressed = await this.decompress(data);
      const frame = JSON.parse(new TextDecoder().decode(decompressed));
      
      return frame;
    } catch (error) {
      // File not found or error reading
      return null;
    }
  }
  
  /**
   * Set frame to file system
   */
  private async setToFileSystem(frame: CachedFrame): Promise<void> {
    if (!this.fileSystemHandle) return;
    
    try {
      const fileName = `${frame.id}.cache`;
      const fileHandle = await this.fileSystemHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      
      // Serialize and compress
      const serialized = new TextEncoder().encode(JSON.stringify(frame));
      const compressed = await this.compress(serialized.buffer);
      
      await writable.write(compressed);
      await writable.close();
    } catch (error) {
      console.error('Failed to write to file system:', error);
      throw error;
    }
  }
  
  /**
   * Compress data using CompressionStream API
   */
  private async compress(data: ArrayBuffer): Promise<ArrayBuffer> {
    const stream = new Blob([data]).stream();
    const compressedStream = stream.pipeThrough(
      new CompressionStream('gzip') as any
    );
    const compressedBlob = await new Response(compressedStream).blob();
    return await compressedBlob.arrayBuffer();
  }
  
  /**
   * Decompress data using DecompressionStream API
   */
  private async decompress(data: ArrayBuffer): Promise<ArrayBuffer> {
    const stream = new Blob([data]).stream();
    const decompressedStream = stream.pipeThrough(
      new DecompressionStream('gzip') as any
    );
    const decompressedBlob = await new Response(decompressedStream).blob();
    return await decompressedBlob.arrayBuffer();
  }
  
  /**
   * Clear cache by node hash (when node configuration changes)
   */
  async clearByNodeHash(nodeHash: string): Promise<void> {
    // Clear from memory
    const keysToDelete: string[] = [];
    this.memoryCache.forEach((frame, key) => {
      if (frame.nodeHash === nodeHash) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => {
      const frame = this.memoryCache.get(key);
      if (frame) {
        this.memoryCacheSize -= frame.size;
        this.memoryCache.delete(key);
      }
    });
    
    // Clear from IndexedDB
    if (this.db) {
      const transaction = this.db.transaction(['frames'], 'readwrite');
      const store = transaction.objectStore('frames');
      const index = store.index('nodeHash');
      const request = index.openCursor(IDBKeyRange.only(nodeHash));
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    }
    
    // File system cache cleanup can be done lazily
  }
  
  /**
   * Clear all cache
   */
  async clearAll(): Promise<void> {
    // Clear memory
    this.memoryCache.clear();
    this.memoryCacheSize = 0;
    
    // Clear IndexedDB
    if (this.db) {
      const transaction = this.db.transaction(['frames'], 'readwrite');
      const store = transaction.objectStore('frames');
      await store.clear();
    }
    
    // Clear file system (if enabled)
    if (this.fileSystemHandle) {
      try {
        const entries: any[] = [];
        // @ts-ignore
        for await (const entry of this.fileSystemHandle.values()) {
          entries.push(entry);
        }
        for (const entry of entries) {
          if (entry.kind === 'file' && entry.name.endsWith('.cache')) {
            await this.fileSystemHandle.removeEntry(entry.name);
          }
        }
      } catch (error) {
        console.error('Failed to clear file system cache:', error);
      }
    }
  }
  
  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    memoryUsage: number;
    memoryCount: number;
    indexedDBUsage: number;
    indexedDBCount: number;
    fileSystemEnabled: boolean;
  }> {
    let indexedDBCount = 0;
    let indexedDBUsage = 0;
    
    if (this.db) {
      const transaction = this.db.transaction(['frames'], 'readonly');
      const store = transaction.objectStore('frames');
      const countRequest = store.count();
      
      indexedDBCount = await new Promise((resolve) => {
        countRequest.onsuccess = () => resolve(countRequest.result);
      });
      
      // Estimate size (rough calculation)
      indexedDBUsage = indexedDBCount * 1024 * 1024; // Rough estimate
    }
    
    return {
      memoryUsage: this.memoryCacheSize,
      memoryCount: this.memoryCache.size,
      indexedDBUsage,
      indexedDBCount,
      fileSystemEnabled: this.config.enableFileSystemCache && !!this.fileSystemHandle,
    };
  }
  
  /**
   * Dispose cache manager
   */
  dispose(): void {
    this.memoryCache.clear();
    this.memoryCacheSize = 0;
    
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

/**
 * Generate hash for node configuration
 */
export function generateNodeHash(nodeConfig: any): string {
  const str = JSON.stringify(nodeConfig);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}


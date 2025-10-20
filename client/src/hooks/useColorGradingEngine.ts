import { useEffect, useRef, useState, useCallback } from 'react';
import { WebGLEngine } from '@/lib/webgl/WebGLEngine';
import { RenderEngine, RenderMode } from '@/lib/render/RenderEngine';
import { NodeSystem, NodeType, Node } from '@/lib/nodes/NodeSystem';
import { ScopeRenderer, ScopeType } from '@/lib/scopes/ScopeRenderer';

export interface ColorGradingState {
  isInitialized: boolean;
  isProcessing: boolean;
  currentFrame: number;
  totalFrames: number;
  renderMode: RenderMode;
  selectedNode: Node | null;
}

export function useColorGradingEngine(
  viewerCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  scopeCanvasRefs: {
    waveform: React.RefObject<HTMLCanvasElement | null>;
    vectorscope: React.RefObject<HTMLCanvasElement | null>;
    parade: React.RefObject<HTMLCanvasElement | null>;
    histogram: React.RefObject<HTMLCanvasElement | null>;
  }
) {
  const renderEngineRef = useRef<RenderEngine | null>(null);
  const nodeSystemRef = useRef<NodeSystem | null>(null);
  const scopeRenderersRef = useRef<Record<string, ScopeRenderer>>({});
  
  const [state, setState] = useState<ColorGradingState>({
    isInitialized: false,
    isProcessing: false,
    currentFrame: 0,
    totalFrames: 0,
    renderMode: RenderMode.REALTIME,
    selectedNode: null,
  });
  
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | HTMLVideoElement | null>(null);
  
  /**
   * Initialize engines
   */
  useEffect(() => {
    if (!viewerCanvasRef.current) return;
    
    try {
      // Initialize render engine
      renderEngineRef.current = new RenderEngine(viewerCanvasRef.current, {
        mode: RenderMode.REALTIME,
        cacheEnabled: true,
        quality: 'high',
      });
      
      // Initialize node system
      nodeSystemRef.current = new NodeSystem();
      
      // Create default node
      const defaultNode = nodeSystemRef.current.createNode(
        NodeType.PRIMARY_WHEELS,
        { x: 100, y: 100 }
      );
      nodeSystemRef.current.selectNode(defaultNode.id);
      
      // Initialize scope renderers
      if (scopeCanvasRefs.waveform.current) {
        scopeRenderersRef.current.waveform = new ScopeRenderer(
          scopeCanvasRefs.waveform.current,
          { type: ScopeType.WAVEFORM }
        );
      }
      
      if (scopeCanvasRefs.vectorscope.current) {
        scopeRenderersRef.current.vectorscope = new ScopeRenderer(
          scopeCanvasRefs.vectorscope.current,
          { type: ScopeType.VECTORSCOPE }
        );
      }
      
      if (scopeCanvasRefs.parade.current) {
        scopeRenderersRef.current.parade = new ScopeRenderer(
          scopeCanvasRefs.parade.current,
          { type: ScopeType.PARADE }
        );
      }
      
      if (scopeCanvasRefs.histogram.current) {
        scopeRenderersRef.current.histogram = new ScopeRenderer(
          scopeCanvasRefs.histogram.current,
          { type: ScopeType.HISTOGRAM }
        );
      }
      
      setState(prev => ({
        ...prev,
        isInitialized: true,
        selectedNode: defaultNode,
      }));
    } catch (error) {
      console.error('Failed to initialize engine:', error);
    }
    
    return () => {
      if (renderEngineRef.current) {
        renderEngineRef.current.dispose();
      }
    };
  }, [viewerCanvasRef, scopeCanvasRefs]);
  
  /**
   * Load media file
   */
  const loadFile = useCallback(async (file: File) => {
    setState(prev => ({ ...prev, isProcessing: true }));
    
    try {
      const url = URL.createObjectURL(file);
      
      if (file.type.startsWith('image/')) {
        const img = new Image();
        img.src = url;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        setSourceImage(img);
        
        // Render initial frame
        if (renderEngineRef.current && nodeSystemRef.current) {
          const nodes = nodeSystemRef.current.export().nodes;
          const imageData = await renderEngineRef.current.renderFrame(img, nodes, 0);
          
          // Update scopes
          Object.values(scopeRenderersRef.current).forEach(renderer => {
            renderer.render(imageData);
          });
        }
      } else if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = url;
        video.load();
        await new Promise((resolve) => {
          video.onloadedmetadata = resolve;
        });
        setSourceImage(video);
        
        setState(prev => ({
          ...prev,
          totalFrames: Math.floor(video.duration * 30), // Assuming 30fps
        }));
      }
    } catch (error) {
      console.error('Failed to load file:', error);
    } finally {
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  }, []);
  
  /**
   * Update node parameters
   */
  const updateNodeParams = useCallback((nodeId: string, params: Record<string, any>) => {
    if (!nodeSystemRef.current) return;
    
    nodeSystemRef.current.updateNodeParams(nodeId, params);
    
    // Re-render
    if (renderEngineRef.current && sourceImage) {
      setState(prev => ({ ...prev, isProcessing: true }));
      
      const nodes = nodeSystemRef.current!.export().nodes;
      renderEngineRef.current.renderFrame(sourceImage, nodes, state.currentFrame)
        .then(imageData => {
          // Update scopes
          Object.values(scopeRenderersRef.current).forEach(renderer => {
            renderer.render(imageData);
          });
          
          setState(prev => ({ ...prev, isProcessing: false }));
        })
        .catch(error => {
          console.error('Render failed:', error);
          setState(prev => ({ ...prev, isProcessing: false }));
        });
    }
  }, [sourceImage, state.currentFrame]);
  
  /**
   * Add new node
   */
  const addNode = useCallback((type: NodeType, position: { x: number; y: number }) => {
    if (!nodeSystemRef.current) return null;
    
    const node = nodeSystemRef.current.createNode(type, position);
    setState(prev => ({ ...prev, selectedNode: node }));
    
    return node;
  }, []);
  
  /**
   * Delete node
   */
  const deleteNode = useCallback((nodeId: string) => {
    if (!nodeSystemRef.current) return;
    
    nodeSystemRef.current.deleteNode(nodeId);
    
    const selectedNode = nodeSystemRef.current.getSelectedNode();
    setState(prev => ({ ...prev, selectedNode }));
  }, []);
  
  /**
   * Select node
   */
  const selectNode = useCallback((nodeId: string | null) => {
    if (!nodeSystemRef.current) return;
    
    nodeSystemRef.current.selectNode(nodeId);
    const selectedNode = nodeSystemRef.current.getSelectedNode();
    setState(prev => ({ ...prev, selectedNode }));
  }, []);
  
  /**
   * Connect nodes
   */
  const connectNodes = useCallback((fromId: string, toId: string) => {
    if (!nodeSystemRef.current) return;
    
    nodeSystemRef.current.connect(fromId, toId);
  }, []);
  
  /**
   * Set render mode
   */
  const setRenderMode = useCallback(async (mode: RenderMode) => {
    if (!renderEngineRef.current) return;
    
    await renderEngineRef.current.setRenderMode(mode);
    setState(prev => ({ ...prev, renderMode: mode }));
  }, []);
  
  /**
   * Request cache directory (for standalone mode)
   */
  const requestCacheDirectory = useCallback(async () => {
    if (!renderEngineRef.current) return false;
    
    return await renderEngineRef.current.requestCacheDirectory();
  }, []);
  
  /**
   * Export project
   */
  const exportProject = useCallback(() => {
    if (!nodeSystemRef.current) return null;
    
    return nodeSystemRef.current.export();
  }, []);
  
  /**
   * Import project
   */
  const importProject = useCallback((data: any) => {
    if (!nodeSystemRef.current) return;
    
    nodeSystemRef.current.import(data);
    const selectedNode = nodeSystemRef.current.getSelectedNode();
    setState(prev => ({ ...prev, selectedNode }));
  }, []);
  
  /**
   * Get all nodes
   */
  const getNodes = useCallback(() => {
    if (!nodeSystemRef.current) return [];
    return nodeSystemRef.current.getNodes();
  }, [nodeSystemRef.current]);
  
  /**
   * Get cache stats
   */
  const getCacheStats = useCallback(async () => {
    if (!renderEngineRef.current) return null;
    return await renderEngineRef.current.getCacheStats();
  }, []);
  
  return {
    state,
    loadFile,
    updateNodeParams,
    addNode,
    deleteNode,
    selectNode,
    connectNodes,
    setRenderMode,
    requestCacheDirectory,
    exportProject,
    importProject,
    getNodes,
    getCacheStats,
  };
}


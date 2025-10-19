/**
 * Node-based Color Grading System
 * Inspired by DaVinci Resolve's node architecture
 */

export enum NodeType {
  // Primary corrections
  PRIMARY_WHEELS = 'primary_wheels',
  PRIMARY_BARS = 'primary_bars',
  LOG_WHEELS = 'log_wheels',
  
  // Curves
  CURVES_RGB = 'curves_rgb',
  CURVES_HUE_VS_HUE = 'curves_hue_vs_hue',
  CURVES_HUE_VS_SAT = 'curves_hue_vs_sat',
  CURVES_HUE_VS_LUM = 'curves_hue_vs_lum',
  CURVES_LUM_VS_SAT = 'curves_lum_vs_sat',
  CURVES_SAT_VS_SAT = 'curves_sat_vs_sat',
  
  // Secondary corrections
  QUALIFIER = 'qualifier',
  POWER_WINDOW = 'power_window',
  
  // Effects
  CHROMA_KEY = 'chroma_key',
  COLOR_SPACE_TRANSFORM = 'color_space_transform',
  LUT = 'lut',
  BLUR = 'blur',
  SHARPEN = 'sharpen',
  NOISE_REDUCTION = 'noise_reduction',
  
  // Compositing
  LAYER_MIXER = 'layer_mixer',
  ALPHA_OUTPUT = 'alpha_output',
}

export interface NodeConnection {
  from: string;  // Source node ID
  to: string;    // Target node ID
  fromOutput?: number;  // Output index (for nodes with multiple outputs)
  toInput?: number;     // Input index (for nodes with multiple inputs)
}

export interface Node {
  id: string;
  type: NodeType;
  label: string;
  enabled: boolean;
  position: { x: number; y: number };
  params: Record<string, any>;
  inputs: number;   // Number of inputs
  outputs: number;  // Number of outputs
}

/**
 * Primary Wheels Parameters
 */
export interface PrimaryWheelsParams {
  // Lift (Shadows)
  lift: { r: number; g: number; b: number };
  liftMaster: number;
  
  // Gamma (Midtones)
  gamma: { r: number; g: number; b: number };
  gammaMaster: number;
  
  // Gain (Highlights)
  gain: { r: number; g: number; b: number };
  gainMaster: number;
  
  // Offset (Overall)
  offset: { r: number; g: number; b: number };
  offsetMaster: number;
  
  // Adjustments
  contrast: number;
  saturation: number;
  hue: number;
  temperature: number;
  tint: number;
  exposure: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  midtoneDetail: number;
  colorBoost: number;
}

/**
 * Qualifier Parameters (for secondary corrections)
 */
export interface QualifierParams {
  hueRange: [number, number];    // 0-360
  satRange: [number, number];    // 0-1
  lumRange: [number, number];    // 0-1
  hueSoftness: number;
  satSoftness: number;
  lumSoftness: number;
  invertMask: boolean;
  denoise: number;
  blur: number;
}

/**
 * Power Window Parameters
 */
export interface PowerWindowParams {
  type: 'circle' | 'rectangle' | 'polygon' | 'gradient';
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  softness: number;
  opacity: number;
  invert: boolean;
  tracking: {
    enabled: boolean;
    points: Array<{ x: number; y: number; frame: number }>;
  };
}

/**
 * Chroma Key Parameters
 */
export interface ChromaKeyParams {
  keyColor: { r: number; g: number; b: number };
  threshold: number;
  smoothness: number;
  spillSuppression: number;
  despill: number;
  edgeFeather: number;
}

/**
 * Color Space Transform Parameters
 */
export interface ColorSpaceTransformParams {
  sourceSpace: string;
  sourceTransfer: string;
  targetSpace: string;
  targetTransfer: string;
  exposure: number;
}

/**
 * Node System Manager
 */
export class NodeSystem {
  private nodes: Map<string, Node> = new Map();
  private connections: NodeConnection[] = [];
  private selectedNodeId: string | null = null;
  
  /**
   * Create a new node
   */
  createNode(type: NodeType, position: { x: number; y: number }): Node {
    const id = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const node: Node = {
      id,
      type,
      label: this.getDefaultLabel(type),
      enabled: true,
      position,
      params: this.getDefaultParams(type),
      inputs: this.getInputCount(type),
      outputs: this.getOutputCount(type),
    };
    
    this.nodes.set(id, node);
    return node;
  }
  
  /**
   * Get default label for node type
   */
  private getDefaultLabel(type: NodeType): string {
    const labels: Record<NodeType, string> = {
      [NodeType.PRIMARY_WHEELS]: 'Primary Wheels',
      [NodeType.PRIMARY_BARS]: 'Primary Bars',
      [NodeType.LOG_WHEELS]: 'Log Wheels',
      [NodeType.CURVES_RGB]: 'RGB Curves',
      [NodeType.CURVES_HUE_VS_HUE]: 'Hue vs Hue',
      [NodeType.CURVES_HUE_VS_SAT]: 'Hue vs Sat',
      [NodeType.CURVES_HUE_VS_LUM]: 'Hue vs Lum',
      [NodeType.CURVES_LUM_VS_SAT]: 'Lum vs Sat',
      [NodeType.CURVES_SAT_VS_SAT]: 'Sat vs Sat',
      [NodeType.QUALIFIER]: 'Qualifier',
      [NodeType.POWER_WINDOW]: 'Power Window',
      [NodeType.CHROMA_KEY]: 'Chroma Key',
      [NodeType.COLOR_SPACE_TRANSFORM]: 'Color Space',
      [NodeType.LUT]: 'LUT',
      [NodeType.BLUR]: 'Blur',
      [NodeType.SHARPEN]: 'Sharpen',
      [NodeType.NOISE_REDUCTION]: 'Noise Reduction',
      [NodeType.LAYER_MIXER]: 'Layer Mixer',
      [NodeType.ALPHA_OUTPUT]: 'Alpha Output',
    };
    
    return labels[type] || 'Unknown';
  }
  
  /**
   * Get default parameters for node type
   */
  private getDefaultParams(type: NodeType): Record<string, any> {
    switch (type) {
      case NodeType.PRIMARY_WHEELS:
        return {
          lift: { r: 0, g: 0, b: 0 },
          liftMaster: 0,
          gamma: { r: 0, g: 0, b: 0 },
          gammaMaster: 0,
          gain: { r: 0, g: 0, b: 0 },
          gainMaster: 0,
          offset: { r: 0, g: 0, b: 0 },
          offsetMaster: 0,
          contrast: 0,
          saturation: 0,
          hue: 0,
          temperature: 0,
          tint: 0,
          exposure: 0,
          highlights: 0,
          shadows: 0,
          whites: 0,
          blacks: 0,
          midtoneDetail: 0,
          colorBoost: 0,
        } as PrimaryWheelsParams;
        
      case NodeType.QUALIFIER:
        return {
          hueRange: [0, 360],
          satRange: [0, 1],
          lumRange: [0, 1],
          hueSoftness: 0.1,
          satSoftness: 0.1,
          lumSoftness: 0.1,
          invertMask: false,
          denoise: 0,
          blur: 0,
        } as QualifierParams;
        
      case NodeType.POWER_WINDOW:
        return {
          type: 'circle',
          position: { x: 0.5, y: 0.5 },
          size: { width: 0.3, height: 0.3 },
          rotation: 0,
          softness: 0.1,
          opacity: 1,
          invert: false,
          tracking: {
            enabled: false,
            points: [],
          },
        } as PowerWindowParams;
        
      case NodeType.CHROMA_KEY:
        return {
          keyColor: { r: 0, g: 255, b: 0 },
          threshold: 0.3,
          smoothness: 0.1,
          spillSuppression: 0.5,
          despill: 0.5,
          edgeFeather: 0,
        } as ChromaKeyParams;
        
      case NodeType.COLOR_SPACE_TRANSFORM:
        return {
          sourceSpace: 'sRGB',
          sourceTransfer: 'sRGB',
          targetSpace: 'Rec.2020',
          targetTransfer: 'PQ',
          exposure: 1.0,
        } as ColorSpaceTransformParams;
        
      default:
        return {};
    }
  }
  
  /**
   * Get input count for node type
   */
  private getInputCount(type: NodeType): number {
    switch (type) {
      case NodeType.LAYER_MIXER:
        return 2;
      default:
        return 1;
    }
  }
  
  /**
   * Get output count for node type
   */
  private getOutputCount(type: NodeType): number {
    switch (type) {
      case NodeType.ALPHA_OUTPUT:
        return 2;  // RGB and Alpha
      default:
        return 1;
    }
  }
  
  /**
   * Connect two nodes
   */
  connect(fromId: string, toId: string, fromOutput: number = 0, toInput: number = 0): boolean {
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);
    
    if (!fromNode || !toNode) {
      return false;
    }
    
    // Check if connection already exists
    const exists = this.connections.some(
      conn => conn.from === fromId && conn.to === toId &&
              conn.fromOutput === fromOutput && conn.toInput === toInput
    );
    
    if (exists) {
      return false;
    }
    
    this.connections.push({
      from: fromId,
      to: toId,
      fromOutput,
      toInput,
    });
    
    return true;
  }
  
  /**
   * Disconnect nodes
   */
  disconnect(fromId: string, toId: string): void {
    this.connections = this.connections.filter(
      conn => !(conn.from === fromId && conn.to === toId)
    );
  }
  
  /**
   * Delete node
   */
  deleteNode(id: string): void {
    this.nodes.delete(id);
    
    // Remove all connections involving this node
    this.connections = this.connections.filter(
      conn => conn.from !== id && conn.to !== id
    );
    
    if (this.selectedNodeId === id) {
      this.selectedNodeId = null;
    }
  }
  
  /**
   * Update node parameters
   */
  updateNodeParams(id: string, params: Partial<Record<string, any>>): void {
    const node = this.nodes.get(id);
    if (node) {
      node.params = { ...node.params, ...params };
    }
  }
  
  /**
   * Get node execution order (topological sort)
   */
  getExecutionOrder(): string[] {
    const visited = new Set<string>();
    const order: string[] = [];
    
    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      // Visit dependencies first
      const dependencies = this.connections
        .filter(conn => conn.to === nodeId)
        .map(conn => conn.from);
      
      dependencies.forEach(depId => visit(depId));
      
      order.push(nodeId);
    };
    
    // Find root nodes (nodes with no inputs)
    const rootNodes = Array.from(this.nodes.keys()).filter(nodeId => {
      return !this.connections.some(conn => conn.to === nodeId);
    });
    
    rootNodes.forEach(nodeId => visit(nodeId));
    
    return order;
  }
  
  /**
   * Export node graph
   */
  export(): { nodes: Node[]; connections: NodeConnection[] } {
    return {
      nodes: Array.from(this.nodes.values()),
      connections: [...this.connections],
    };
  }
  
  /**
   * Import node graph
   */
  import(data: { nodes: Node[]; connections: NodeConnection[] }): void {
    this.nodes.clear();
    this.connections = [];
    
    data.nodes.forEach(node => {
      this.nodes.set(node.id, node);
    });
    
    this.connections = [...data.connections];
  }
  
  /**
   * Get all nodes
   */
  getNodes(): Node[] {
    return Array.from(this.nodes.values());
  }
  
  /**
   * Get node by ID
   */
  getNode(id: string): Node | undefined {
    return this.nodes.get(id);
  }
  
  /**
   * Get connections
   */
  getConnections(): NodeConnection[] {
    return [...this.connections];
  }
  
  /**
   * Select node
   */
  selectNode(id: string | null): void {
    this.selectedNodeId = id;
  }
  
  /**
   * Get selected node
   */
  getSelectedNode(): Node | null {
    return this.selectedNodeId ? this.nodes.get(this.selectedNodeId) || null : null;
  }
}


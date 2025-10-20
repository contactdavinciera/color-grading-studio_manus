import { useEffect, useRef, useState } from 'react';
import { Node, NodeType, NodeConnection } from '@/lib/nodes/NodeSystem';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus } from 'lucide-react';

interface NodeGraphEditorProps {
  nodes: Node[];
  connections: NodeConnection[];
  selectedNodeId: string | null;
  onAddNode: (type: NodeType, position: { x: number; y: number }) => void;
  onSelectNode: (nodeId: string | null) => void;
  onConnectNodes: (fromId: string, toId: string) => void;
  onDeleteNode: (nodeId: string) => void;
}

export function NodeGraphEditor({
  nodes,
  connections,
  selectedNodeId,
  onAddNode,
  onSelectNode,
  onConnectNodes,
  onDeleteNode,
}: NodeGraphEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    drawGrid(ctx, canvas.width, canvas.height, offset, scale);
    
    // Draw connections
    connections.forEach(conn => {
      const fromNode = nodes.find(n => n.id === conn.from);
      const toNode = nodes.find(n => n.id === conn.to);
      
      if (fromNode && toNode) {
        drawConnection(ctx, fromNode, toNode, offset, scale);
      }
    });
    
    // Draw nodes
    nodes.forEach(node => {
      drawNode(ctx, node, node.id === selectedNodeId, offset, scale);
    });
  }, [nodes, connections, selectedNodeId, offset, scale]);
  
  const drawGrid = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    offset: { x: number; y: number },
    scale: number
  ) => {
    const gridSize = 50 * scale;
    
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    
    // Vertical lines
    for (let x = offset.x % gridSize; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    // Horizontal lines
    for (let y = offset.y % gridSize; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  };
  
  const drawNode = (
    ctx: CanvasRenderingContext2D,
    node: Node,
    isSelected: boolean,
    offset: { x: number; y: number },
    scale: number
  ) => {
    const x = node.position.x * scale + offset.x;
    const y = node.position.y * scale + offset.y;
    const width = 150 * scale;
    const height = 60 * scale;
    
    // Node background
    ctx.fillStyle = node.enabled ? '#1a1a1a' : '#0f0f0f';
    ctx.fillRect(x, y, width, height);
    
    // Node border
    ctx.strokeStyle = isSelected ? '#3b82f6' : '#2a2a2a';
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.strokeRect(x, y, width, height);
    
    // Node header
    ctx.fillStyle = getNodeColor(node.type);
    ctx.fillRect(x, y, width, 20 * scale);
    
    // Node label
    ctx.fillStyle = '#ffffff';
    ctx.font = `${12 * scale}px sans-serif`;
    ctx.fillText(node.label, x + 10 * scale, y + 14 * scale);
    
    // Input/output ports
    const portRadius = 5 * scale;
    
    // Input port
    if (node.inputs > 0) {
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(x, y + height / 2, portRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Output port
    if (node.outputs > 0) {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(x + width, y + height / 2, portRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Enabled indicator
    if (!node.enabled) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(x, y, width, height);
    }
  };
  
  const drawConnection = (
    ctx: CanvasRenderingContext2D,
    fromNode: Node,
    toNode: Node,
    offset: { x: number; y: number },
    scale: number
  ) => {
    const fromX = (fromNode.position.x + 150) * scale + offset.x;
    const fromY = (fromNode.position.y + 30) * scale + offset.y;
    const toX = toNode.position.x * scale + offset.x;
    const toY = (toNode.position.y + 30) * scale + offset.y;
    
    // Bezier curve
    const cp1x = fromX + 50 * scale;
    const cp1y = fromY;
    const cp2x = toX - 50 * scale;
    const cp2y = toY;
    
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, toX, toY);
    ctx.stroke();
  };
  
  const getNodeColor = (type: NodeType): string => {
    switch (type) {
      case NodeType.PRIMARY_WHEELS:
      case NodeType.PRIMARY_BARS:
      case NodeType.LOG_WHEELS:
        return '#3b82f6';
      case NodeType.CURVES_RGB:
      case NodeType.CURVES_HUE_VS_HUE:
      case NodeType.CURVES_HUE_VS_SAT:
      case NodeType.CURVES_HUE_VS_LUM:
      case NodeType.CURVES_LUM_VS_SAT:
      case NodeType.CURVES_SAT_VS_SAT:
        return '#8b5cf6';
      case NodeType.QUALIFIER:
      case NodeType.POWER_WINDOW:
        return '#ec4899';
      case NodeType.CHROMA_KEY:
        return '#10b981';
      case NodeType.COLOR_SPACE_TRANSFORM:
      case NodeType.LUT:
        return '#f59e0b';
      default:
        return '#6b7280';
    }
  };
  
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - offset.x) / scale;
    const y = (e.clientY - rect.top - offset.y) / scale;
    
    // Check if clicked on a node
    const clickedNode = nodes.find(node => {
      return (
        x >= node.position.x &&
        x <= node.position.x + 150 &&
        y >= node.position.y &&
        y <= node.position.y + 60
      );
    });
    
    if (clickedNode) {
      onSelectNode(clickedNode.id);
    } else {
      onSelectNode(null);
    }
  };
  
  const handleAddNodeClick = (type: NodeType) => {
    const position = {
      x: (200 - offset.x) / scale,
      y: (200 - offset.y) / scale,
    };
    onAddNode(type, position);
  };
  
  return (
    <div className="h-full flex flex-col">
      <div className="h-10 bg-[#1a1a1a] border-b border-[#2a2a2a] flex items-center px-3 gap-2">
        <span className="text-xs font-medium text-gray-400">Node Graph</span>
        <div className="flex-1" />
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
              <Plus className="w-3 h-3" />
              Add Node
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-[#1a1a1a] border-[#2a2a2a]">
            <DropdownMenuLabel>Primary Corrections</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleAddNodeClick(NodeType.PRIMARY_WHEELS)}>
              Primary Wheels
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddNodeClick(NodeType.PRIMARY_BARS)}>
              Primary Bars
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddNodeClick(NodeType.LOG_WHEELS)}>
              Log Wheels
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Curves</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleAddNodeClick(NodeType.CURVES_RGB)}>
              RGB Curves
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddNodeClick(NodeType.CURVES_HUE_VS_HUE)}>
              Hue vs Hue
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddNodeClick(NodeType.CURVES_HUE_VS_SAT)}>
              Hue vs Sat
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Secondary</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleAddNodeClick(NodeType.QUALIFIER)}>
              Qualifier
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddNodeClick(NodeType.POWER_WINDOW)}>
              Power Window
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Effects</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleAddNodeClick(NodeType.CHROMA_KEY)}>
              Chroma Key
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddNodeClick(NodeType.LUT)}>
              LUT
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddNodeClick(NodeType.COLOR_SPACE_TRANSFORM)}>
              Color Space Transform
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        
        {selectedNodeId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onDeleteNode(selectedNodeId)}
          >
            Delete
          </Button>
        )}
      </div>
      
      <canvas
        ref={canvasRef}
        className="flex-1 cursor-crosshair"
        onClick={handleCanvasClick}
      />
    </div>
  );
}


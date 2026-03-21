import { useEffect, useMemo } from "react";

import type { Edge, Node } from "@xyflow/react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  Position,
  useReactFlow,
} from "@xyflow/react";
import type { MindMap, MindMapNode } from "@mindmap/core";

import { MindMapNode as MindMapNodeView, type MindMapNodeData } from "./MindMapNode.js";

type MindMapCanvasProps = {
  map: MindMap | null;
  selectedNodeId: string | null;
  onAddChild: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onEditNode: (nodeId: string) => void;
  onOpenContextMenu: (node: MindMapNode, position: { x: number; y: number }) => void;
  onSelectNode: (nodeId: string) => void;
};

const NODE_WIDTH = 260;
const NODE_HEIGHT = 112;
const HORIZONTAL_GAP = 48;
const VERTICAL_GAP = 40;
const LAYOUT_PADDING = 96;

const nodeTypes = {
  mindMapNode: MindMapNodeView,
};

type MindMapFlowNode = Node<MindMapNodeData, "mindMapNode">;

const measureSubtree = (map: MindMap, nodeId: string, widths: Map<string, number>): number => {
  const node = map.nodes[nodeId];

  if (!node || node.children.length === 0) {
    widths.set(nodeId, NODE_WIDTH);
    return NODE_WIDTH;
  }

  const childWidths = node.children.map((childId) => measureSubtree(map, childId, widths));
  const totalWidth =
    childWidths.reduce((total, width) => total + width, 0) +
    HORIZONTAL_GAP * Math.max(0, childWidths.length - 1);
  const width = Math.max(NODE_WIDTH, totalWidth);

  widths.set(nodeId, width);
  return width;
};

const layoutMap = (
  map: MindMap,
  selectedNodeId: string | null,
  handlers: Pick<
    MindMapCanvasProps,
    "onAddChild" | "onDeleteNode" | "onEditNode" | "onOpenContextMenu" | "onSelectNode"
  >,
): {
  edges: Edge[];
  nodes: MindMapFlowNode[];
} => {
  const root = map.nodes[map.rootId];

  if (!root) {
    return { edges: [], nodes: [] };
  }

  const widths = new Map<string, number>();
  measureSubtree(map, root.id, widths);
  const nodes: MindMapFlowNode[] = [];
  const edges: Edge[] = [];

  const placeNode = (nodeId: string, left: number, depth: number): void => {
    const node = map.nodes[nodeId];

    if (!node) {
      return;
    }

    const width = widths.get(nodeId) ?? NODE_WIDTH;
    const centerX = left + width / 2;

    nodes.push({
      data: {
        node,
        isRoot: nodeId === map.rootId,
        onAddChild: handlers.onAddChild,
        onDelete: handlers.onDeleteNode,
        onEdit: handlers.onEditNode,
        onOpenContextMenu: (node, event) =>
          handlers.onOpenContextMenu(node, {
            x: event.clientX,
            y: event.clientY,
          }),
        onSelect: handlers.onSelectNode,
      },
      draggable: false,
      id: nodeId,
      position: {
        x: centerX - NODE_WIDTH / 2 + LAYOUT_PADDING,
        y: depth * (NODE_HEIGHT + VERTICAL_GAP) + LAYOUT_PADDING,
      },
      selected: selectedNodeId === nodeId,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      type: "mindMapNode",
    });

    let cursor = left;

    for (const childId of node.children) {
      const childWidth = widths.get(childId) ?? NODE_WIDTH;

      placeNode(childId, cursor, depth + 1);
      edges.push({
        id: `${nodeId}-${childId}`,
        source: nodeId,
        target: childId,
        type: "smoothstep",
      });
      cursor += childWidth + HORIZONTAL_GAP;
    }
  };

  placeNode(root.id, 0, 0);

  return { edges, nodes };
};

function ViewportRefitter({ signature }: { signature: string }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (!signature) {
      return;
    }

    fitView({
      duration: 250,
      includeHiddenNodes: true,
      padding: 0.22,
    });
  }, [fitView, signature]);

  return null;
}

function MindMapCanvasInner({
  map,
  selectedNodeId,
  onAddChild,
  onDeleteNode,
  onEditNode,
  onOpenContextMenu,
  onSelectNode,
}: MindMapCanvasProps) {
  const { edges, nodes } = useMemo(
    () =>
      map
        ? layoutMap(map, selectedNodeId, {
            onAddChild,
            onDeleteNode,
            onEditNode,
            onOpenContextMenu,
            onSelectNode,
          })
        : { edges: [], nodes: [] },
    [map, onAddChild, onDeleteNode, onEditNode, onOpenContextMenu, onSelectNode, selectedNodeId],
  );

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/70 shadow-[0_30px_80px_rgba(15,23,42,0.35)]">
      <ReactFlow
        edges={edges}
        fitView
        maxZoom={1.6}
        minZoom={0.25}
        nodes={nodes}
        nodeTypes={nodeTypes}
        nodesConnectable={false}
        nodesDraggable={false}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          onSelectNode(node.id);
          onOpenContextMenu(node.data.node, {
            x: event.clientX,
            y: event.clientY,
          });
        }}
        onPaneClick={() => onSelectNode("")}
        panOnDrag
        panOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <ViewportRefitter signature={map?.updatedAt ?? ""} />
        <Background color="#334155" gap={20} size={1} variant={BackgroundVariant.Dots} />
        <Controls showInteractive={false} />
      </ReactFlow>

      {map ? null : (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-3xl border border-slate-800/80 bg-slate-950/90 px-6 py-4 text-center shadow-xl">
            <p className="text-sm font-semibold text-slate-100">マップを待機中</p>
            <p className="mt-1 text-xs text-slate-400">WebSocket から初期データを受信すると表示されます。</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function MindMapCanvas(props: MindMapCanvasProps) {
  return (
    <ReactFlowProvider>
      <MindMapCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import { applyNodeChanges, type Edge, type Node, type NodeChange } from "@xyflow/react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import type { MindMap, NodePosition } from "@mindmap/core";

import { MindMapNode as MindMapNodeView, type MindMapNodeData } from "./MindMapNode.js";
import { centerNodeAt, getBranchDirection, getFallbackNodePositions, getNodeDimensions, getNodePosition } from "./nodeLayout.js";

type MindMapCanvasProps = {
  map: MindMap | null;
  selectedNodeId: string | null;
  editingNodeId: string | null;
  onAddChild: (nodeId: string, preferredDirection?: "left" | "right") => void;
  onAddRootNode: (position: NodePosition) => void;
  onDeleteNode: (nodeId: string) => void;
  onOpenDetails: (nodeId: string) => void;
  onOpenPaneContextMenu: (position: { flowPosition: NodePosition; x: number; y: number }) => void;
  onRequestEdit: (nodeId: string) => void;
  onSaveEdit: (nodeId: string, text: string) => void;
  onSetNodePosition: (nodeId: string, position: NodePosition) => void;
  onSelectNode: (nodeId: string) => void;
};

const nodeTypes = {
  mindMapNode: MindMapNodeView,
};

type MindMapFlowNode = Node<MindMapNodeData, "mindMapNode">;

function ViewportRefitter({
  mapId,
}: {
  mapId: string | null;
}) {
  const { fitView } = useReactFlow();
  const fittedMapIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!mapId || fittedMapIdRef.current === mapId) {
      return;
    }

    fittedMapIdRef.current = mapId;

    window.requestAnimationFrame(() => {
      void fitView({
        duration: 250,
        includeHiddenNodes: true,
        padding: 0.22,
      });
    });
  }, [fitView, mapId]);

  return null;
}

function MindMapCanvasInner({
  map,
  selectedNodeId,
  editingNodeId,
  onAddChild,
  onAddRootNode,
  onDeleteNode,
  onOpenDetails,
  onOpenPaneContextMenu,
  onRequestEdit,
  onSaveEdit,
  onSetNodePosition,
  onSelectNode,
}: MindMapCanvasProps) {
  const isDraggingRef = useRef(false);
  const { screenToFlowPosition } = useReactFlow();
  const fallbackPositions = useMemo(() => (map ? getFallbackNodePositions(map) : {}), [map]);
  const layoutNodes = useMemo(
    () =>
      map
        ? Object.values(map.nodes).map((node) => ({
            data: {
              branchDirection: getBranchDirection(map, node.id, fallbackPositions),
              editingNodeId,
              node,
              isRoot: node.id === map.rootId,
              onAddChild,
              onDelete: onDeleteNode,
              onOpenDetails,
              onRequestEdit,
              onSaveEdit,
              onSelect: onSelectNode,
            },
            draggable: true,
            id: node.id,
            position: getNodePosition(map, node.id, fallbackPositions),
            selected: selectedNodeId === node.id,
            type: "mindMapNode" as const,
          }))
        : [],
    [
      editingNodeId,
      fallbackPositions,
      map,
      onAddChild,
      onDeleteNode,
      onOpenDetails,
      onRequestEdit,
      onSaveEdit,
      onSelectNode,
      selectedNodeId,
    ],
  );
  const edges = useMemo(
    () =>
      map
        ? Object.values(map.nodes).flatMap((node) => {
            const parentPosition = getNodePosition(map, node.id, fallbackPositions);
            const parentDimensions = getNodeDimensions(node.id === map.rootId, node.text);
            const parentCenterX = parentPosition.x + parentDimensions.width / 2;

            return node.children.flatMap((childId) => {
                const child = map.nodes[childId];

                if (!child) {
                  return [];
                }

                const childPosition = getNodePosition(map, childId, fallbackPositions);
                const childDimensions = getNodeDimensions(childId === map.rootId, child.text);
                const childCenterX = childPosition.x + childDimensions.width / 2;
                const childIsLeft =
                  getBranchDirection(map, childId, fallbackPositions) === "left" ||
                  childCenterX < parentCenterX;

                return [{
                  id: `${node.id}-${childId}`,
                  source: node.id,
                  sourceHandle: childIsLeft ? "source-left" : "source-right",
                  target: childId,
                  targetHandle: childIsLeft ? "target-right" : "target-left",
                  type: "bezier",
                } satisfies Edge];
              });
          })
        : [],
    [fallbackPositions, map],
  );
  const [nodesState, setNodesState] = useState<MindMapFlowNode[]>([]);

  useEffect(() => {
    setNodesState(layoutNodes);
  }, [layoutNodes]);

  const onNodesChange = useCallback((changes: NodeChange<MindMapFlowNode>[]) => {
    setNodesState((current) => applyNodeChanges(changes, current) as MindMapFlowNode[]);
  }, []);

  const handleNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const handleNodeDragStop = useCallback(
    (_event: ReactMouseEvent, draggedNode: MindMapFlowNode) => {
      isDraggingRef.current = false;
      onSetNodePosition(draggedNode.id, {
        x: draggedNode.position.x,
        y: draggedNode.position.y,
      });
    },
    [onSetNodePosition],
  );

  const handleCanvasDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const target = event.target;

      if (target.closest(".react-flow__node, .react-flow__edge, .react-flow__controls")) {
        return;
      }

      const flowPosition = centerNodeAt(
        screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        }),
        false,
      );

      onSelectNode("");
      onAddRootNode(flowPosition);
    },
    [onAddRootNode, onSelectNode, screenToFlowPosition],
  );

  return (
    <div
      className="relative h-full min-h-0 w-full overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/70 shadow-[0_30px_80px_rgba(15,23,42,0.35)]"
      onDoubleClickCapture={handleCanvasDoubleClick}
    >
      <ReactFlow
        edges={edges}
        fitView
        maxZoom={1.6}
        minZoom={0.25}
        nodes={nodesState}
        nodeTypes={nodeTypes}
        nodesConnectable={false}
        nodesDraggable
        zoomOnDoubleClick={false}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onPaneClick={() => onSelectNode("")}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          const flowPosition = centerNodeAt(
            screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            }),
            false,
          );

          onSelectNode("");
          onOpenPaneContextMenu({
            flowPosition,
            x: event.clientX,
            y: event.clientY,
          });
        }}
        onNodesChange={onNodesChange}
        panOnDrag
        panOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <ViewportRefitter mapId={map?.id ?? null} />
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

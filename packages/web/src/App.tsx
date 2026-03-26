import { useEffect, useMemo, useRef, useState } from "react";

import type { NodePosition } from "@mindmap/core";

import { ContextMenu } from "./components/ContextMenu.js";
import { MindMapCanvas } from "./components/MindMapCanvas.js";
import { getFallbackNodePositions, getNextChildPosition } from "./components/nodeLayout.js";
import { useMindMap } from "./hooks/useMindMap.js";

const DEFAULT_CHILD_TEXT = "新しいノード";

function statusLabel(status: string): string {
  switch (status) {
    case "open":
      return "接続済み";
    case "connecting":
      return "接続中";
    case "closed":
      return "再接続待ち";
    case "error":
      return "エラー";
    default:
      return status;
  }
}

export default function App() {
  const { actions, error, lastAddedNode, map, status } = useMindMap();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const didInitializeSelection = useRef(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [paneContextMenu, setPaneContextMenu] = useState<{
    flowPosition: NodePosition;
    position: { x: number; y: number };
  } | null>(null);
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<string | null>(null);
  const normalizedNodeIdsRef = useRef(new Set<string>());
  const normalizedMapIdRef = useRef<string | null>(null);

  const selectedNode = useMemo(() => {
    if (!map || !selectedNodeId) {
      return null;
    }

    return map.nodes[selectedNodeId] ?? null;
  }, [map, selectedNodeId]);

  useEffect(() => {
    if (!map) {
      didInitializeSelection.current = false;
      return;
    }

    if (!didInitializeSelection.current) {
      setSelectedNodeId(map.rootId);
      didInitializeSelection.current = true;
      return;
    }

    if (selectedNodeId && !map.nodes[selectedNodeId]) {
      setSelectedNodeId(map.rootId);
    }
  }, [map, selectedNodeId]);

  useEffect(() => {
    if (editingNodeId && map && !map.nodes[editingNodeId]) {
      setEditingNodeId(null);
    }
  }, [editingNodeId, map]);

  useEffect(() => {
    if (!map) {
      normalizedMapIdRef.current = null;
      normalizedNodeIdsRef.current.clear();
      return;
    }

    if (normalizedMapIdRef.current !== map.id) {
      normalizedMapIdRef.current = map.id;
      normalizedNodeIdsRef.current.clear();
    }

    const fallbackPositions = getFallbackNodePositions(map);

    for (const node of Object.values(map.nodes)) {
      if (node.position || normalizedNodeIdsRef.current.has(node.id)) {
        continue;
      }

      const fallbackPosition = fallbackPositions[node.id];

      if (!fallbackPosition) {
        continue;
      }

      if (actions.setNodePosition(node.id, fallbackPosition)) {
        normalizedNodeIdsRef.current.add(node.id);
      }
    }
  }, [actions, map]);

  useEffect(() => {
    if (!lastAddedNode) {
      return;
    }

    setPendingFocusNodeId(lastAddedNode.nodeId);
  }, [lastAddedNode]);

  useEffect(() => {
    if (!pendingFocusNodeId || !map?.nodes[pendingFocusNodeId]) {
      return;
    }

    setSelectedNodeId(pendingFocusNodeId);
    setPaneContextMenu(null);
    setEditingNodeId(null);
    queueMicrotask(() => setEditingNodeId(pendingFocusNodeId));
    setPendingFocusNodeId(null);
  }, [map, pendingFocusNodeId]);

  const requestInlineEdit = (nodeId: string) => {
    if (!map?.nodes[nodeId]) {
      return;
    }

    setPaneContextMenu(null);
    setEditingNodeId(null);
    queueMicrotask(() => setEditingNodeId(nodeId));
  };

  const createNode = (parentId: string, position?: NodePosition) => {
    const parentNode = map?.nodes[parentId];

    if (!map || !parentNode) {
      return;
    }

    const nextPosition =
      position ?? getNextChildPosition(parentNode, parentId === map.rootId);

    setPaneContextMenu(null);
    actions.addNode(parentId, DEFAULT_CHILD_TEXT, nextPosition);
  };

  const handleSaveEdit = (nodeId: string, text: string) => {
    const value = text.trim();

    if (!value || !map?.nodes[nodeId]) {
      setEditingNodeId(null);
      return;
    }

    actions.editNode(nodeId, value);
    setEditingNodeId(null);
  };

  const deleteNode = (nodeId: string) => {
    if (!map?.nodes[nodeId] || nodeId === map.rootId) {
      return;
    }

    const ok = window.confirm("このノードを削除しますか？");
    if (!ok) {
      return;
    }

    actions.deleteNode(nodeId);
    setPaneContextMenu(null);
    if (editingNodeId === nodeId) {
      setEditingNodeId(null);
    }
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(map.rootId);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPaneContextMenu(null);
        setEditingNodeId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const mapTitle = map?.title ?? "Mind Map";
  const nodeCount = map ? Object.keys(map.nodes).length : 0;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.6),transparent_35%)]" />

      <header className="relative z-10 flex items-center justify-between gap-4 border-b border-slate-800/70 bg-slate-950/55 px-5 py-4 backdrop-blur">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-500">
            Mind Map Workspace
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="truncate text-lg font-semibold text-slate-50">{mapTitle}</h1>
            <span className="rounded-full border border-slate-700/70 bg-slate-900/80 px-3 py-1 text-xs text-slate-300">
              {nodeCount} nodes
            </span>
            {selectedNode ? (
              <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-200">
                Selected: {selectedNode.text}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={[
              "rounded-full border px-3 py-1 text-xs font-medium",
              status === "open"
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                : status === "error"
                  ? "border-rose-400/20 bg-rose-400/10 text-rose-200"
                  : "border-amber-400/20 bg-amber-400/10 text-amber-200",
            ].join(" ")}
          >
            {statusLabel(status)}
          </span>
          {error ? (
            <span className="max-w-[320px] truncate rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-xs text-rose-200">
              {error}
            </span>
          ) : null}
        </div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 p-4">
        <MindMapCanvas
          editingNodeId={editingNodeId}
          map={map}
          onAddChild={(nodeId) => createNode(nodeId)}
          onAddRootNode={(position) => createNode(map?.rootId ?? "", position)}
          onDeleteNode={deleteNode}
          onOpenPaneContextMenu={({ flowPosition, x, y }) =>
            setPaneContextMenu({
              flowPosition,
              position: { x, y },
            })
          }
          onRequestEdit={requestInlineEdit}
          onSaveEdit={handleSaveEdit}
          onSelectNode={(nodeId) => {
            setPaneContextMenu(null);
            setSelectedNodeId(nodeId || null);
          }}
          onSetNodePosition={(nodeId, position) => actions.setNodePosition(nodeId, position)}
          selectedNodeId={selectedNodeId}
        />
      </main>

      <ContextMenu
        onAddRootNode={() => {
          if (paneContextMenu) {
            createNode(map?.rootId ?? "", paneContextMenu.flowPosition);
          }
        }}
        onClose={() => setPaneContextMenu(null)}
        position={paneContextMenu?.position ?? null}
      />
    </div>
  );
}

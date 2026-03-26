import { useEffect, useMemo, useRef, useState } from "react";

import type { NodePosition } from "@mindmap/core";

import { ContextMenu } from "./components/ContextMenu.js";
import { MindMapCanvas } from "./components/MindMapCanvas.js";
import { getBranchDirection, getFallbackNodePositions, getNextChildPosition } from "./components/nodeLayout.js";
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
  const { actions, error, lastAddedNode, map, refreshWorkspaces, status, workspaces } = useMindMap();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const didInitializeSelection = useRef(false);
  const currentMapIdRef = useRef<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [paneContextMenu, setPaneContextMenu] = useState<{
    flowPosition: NodePosition;
    position: { x: number; y: number };
  } | null>(null);
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<string | null>(null);
  const normalizedNodeIdsRef = useRef(new Set<string>());
  const normalizedMapIdRef = useRef<string | null>(null);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);

  const selectedNode = useMemo(() => {
    if (!map || !selectedNodeId) {
      return null;
    }

    return map.nodes[selectedNodeId] ?? null;
  }, [map, selectedNodeId]);

  useEffect(() => {
    if (!map) {
      didInitializeSelection.current = false;
      currentMapIdRef.current = null;
      return;
    }

    if (currentMapIdRef.current !== map.id) {
      currentMapIdRef.current = map.id;
      setPaneContextMenu(null);
      setEditingNodeId(null);
      setSelectedNodeId(map.rootId);
      didInitializeSelection.current = true;
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
      position ??
      getNextChildPosition(
        parentNode,
        getBranchDirection(map, parentId, getFallbackNodePositions(map)),
        parentId === map.rootId,
      );

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
        setIsWorkspaceMenuOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!workspaceMenuRef.current?.contains(event.target as Node)) {
        setIsWorkspaceMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, []);

  const mapTitle = map?.title ?? "Mind Map";
  const nodeCount = map ? Object.keys(map.nodes).length : 0;
  const activeWorkspace =
    workspaces.find((workspace) => workspace.isActive) ??
    (map
      ? {
          id: map.id,
          title: map.title,
        }
      : null);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.6),transparent_35%)]" />

      <header className="relative z-10 flex items-center justify-between gap-4 border-b border-slate-800/70 bg-slate-950/55 px-5 py-4 backdrop-blur">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-500">
            Mind Map Workspace
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <div className="relative" ref={workspaceMenuRef}>
              <button
                className="rounded-2xl border border-slate-700/70 bg-slate-900/80 px-3 py-2 text-left text-xs text-slate-200 transition hover:border-slate-500 hover:text-slate-50"
                onClick={() => {
                  setIsWorkspaceMenuOpen((current) => !current);
                  if (workspaces.length === 0) {
                    void refreshWorkspaces();
                  }
                }}
                type="button"
              >
                <span className="block text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  ワークスペース
                </span>
                <span className="mt-1 block max-w-[180px] truncate text-sm font-semibold text-slate-50">
                  {activeWorkspace?.title ?? "未選択"}
                </span>
              </button>

              {isWorkspaceMenuOpen ? (
                <div className="absolute left-0 top-[calc(100%+0.75rem)] z-30 w-72 rounded-3xl border border-slate-700/80 bg-slate-950/95 p-2 shadow-[0_30px_80px_rgba(2,6,23,0.45)] backdrop-blur">
                  <div className="px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      ワークスペース一覧
                    </p>
                  </div>

                  <div className="grid gap-1">
                    {workspaces.map((workspace) => (
                      <button
                        className={[
                          "rounded-2xl border px-3 py-3 text-left transition",
                          workspace.isActive
                            ? "border-sky-300/30 bg-sky-400/10 text-sky-100"
                            : "border-transparent bg-slate-900/70 text-slate-200 hover:border-slate-700/80 hover:bg-slate-900 hover:text-slate-50",
                        ].join(" ")}
                        disabled={workspace.isActive}
                        key={workspace.id}
                        onClick={() => {
                          setPaneContextMenu(null);
                          setEditingNodeId(null);
                          setSelectedNodeId(null);
                          actions.openWorkspace(workspace.id);
                          setIsWorkspaceMenuOpen(false);
                        }}
                        type="button"
                      >
                        <span className="block truncate text-sm font-semibold">{workspace.title}</span>
                        <span className="mt-1 block text-xs text-slate-400">
                          {workspace.nodeCount} nodes
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

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

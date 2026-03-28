import { useEffect, useMemo, useRef, useState } from "react";

import type { NodePosition } from "@mindmap/core";

import { ContextMenu } from "./components/ContextMenu.js";
import { MindMapCanvas } from "./components/MindMapCanvas.js";
import { getBranchDirection, getFallbackNodePositions, getNextChildPosition } from "./components/nodeLayout.js";
import { useMindMap } from "./hooks/useMindMap.js";

const DEFAULT_CHILD_TEXT = "新しいノード";
const DEFAULT_WORKSPACE_TITLE = "新しいワークスペース";

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
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [newWorkspaceTitle, setNewWorkspaceTitle] = useState(DEFAULT_WORKSPACE_TITLE);
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

  const createNode = (
    parentId: string,
    position?: NodePosition,
    preferredDirection?: "left" | "right",
  ) => {
    const parentNode = map?.nodes[parentId];

    if (!map || !parentNode) {
      return;
    }

    const nextPosition =
      position ??
      getNextChildPosition(
        parentNode,
        preferredDirection ??
          getBranchDirection(map, parentId, getFallbackNodePositions(map)),
        parentId === map.rootId,
      );

    setPaneContextMenu(null);
    actions.addNode(parentId, DEFAULT_CHILD_TEXT, nextPosition);
  };

  const handleCreateWorkspace = async () => {
    const normalizedTitle = newWorkspaceTitle.trim();

    try {
      const createdWorkspace = await actions.createWorkspace(normalizedTitle);
      setPaneContextMenu(null);
      setEditingNodeId(null);
      setSelectedNodeId(null);
      setIsCreatingWorkspace(false);
      setIsWorkspaceMenuOpen(false);
      setNewWorkspaceTitle(DEFAULT_WORKSPACE_TITLE);
      const opened = actions.openWorkspace(createdWorkspace.id);
      await refreshWorkspaces();

      if (!opened) {
        window.alert("ワークスペースは作成されましたが、接続待ちのため自動では開けませんでした。接続回復後に一覧から選択してください。");
      }
    } catch (workspaceError) {
      const message =
        workspaceError instanceof Error
          ? workspaceError.message
          : "ワークスペースの作成に失敗しました";
      window.alert(message);
    }
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
        setIsCreatingWorkspace(false);
        setIsWorkspaceMenuOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!workspaceMenuRef.current?.contains(event.target as Node)) {
        setIsCreatingWorkspace(false);
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

      <header className="relative z-20 flex items-center justify-between gap-4 border-b border-slate-800/70 bg-slate-950/55 px-5 py-4 backdrop-blur">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-500">
            Mind Map Workspace
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <div className="relative z-30" ref={workspaceMenuRef}>
              <button
                className="rounded-2xl border border-slate-700/70 bg-slate-900/80 px-3 py-2 text-left text-xs text-slate-200 transition hover:border-slate-500 hover:text-slate-50"
                onClick={() => {
                  setIsWorkspaceMenuOpen((current) => !current);
                  setIsCreatingWorkspace(false);
                  setNewWorkspaceTitle(DEFAULT_WORKSPACE_TITLE);
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
                <div className="absolute left-0 top-[calc(100%+0.75rem)] z-50 w-72 rounded-3xl border border-slate-500/90 bg-slate-950 p-2 shadow-[0_30px_80px_rgba(2,6,23,0.7)]">
                  <div className="px-3 py-2">
                    <p className="text-[11px] font-bold tracking-[0.16em] text-sky-100">
                      ワークスペース一覧
                    </p>
                  </div>

                  <div className="grid gap-1">
                    {workspaces.map((workspace) => (
                      <button
                        className={[
                          "rounded-2xl border px-3 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition",
                          workspace.isActive
                            ? "border-sky-300/45 bg-sky-400/16 text-sky-50"
                            : "border-slate-800/80 bg-slate-900/95 text-slate-50 hover:border-slate-500/90 hover:bg-slate-900 hover:text-white",
                        ].join(" ")}
                        disabled={workspace.isActive}
                        key={workspace.id}
                        onClick={() => {
                          setPaneContextMenu(null);
                          setEditingNodeId(null);
                          setIsCreatingWorkspace(false);
                          setSelectedNodeId(null);
                          actions.openWorkspace(workspace.id);
                          setIsWorkspaceMenuOpen(false);
                        }}
                        type="button"
                      >
                        <span className="block truncate text-sm font-semibold text-inherit">{workspace.title}</span>
                        <span className="mt-1 block text-xs text-slate-200">
                          {workspace.nodeCount} nodes
                        </span>
                      </button>
                    ))}

                    {isCreatingWorkspace ? (
                      <form
                        className="rounded-2xl border border-sky-300/45 bg-slate-900 px-3 py-3 text-left text-white shadow-[0_12px_28px_rgba(15,23,42,0.35)]"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void handleCreateWorkspace();
                        }}
                      >
                        <label className="block text-sm font-bold text-white" htmlFor="new-workspace-title">
                          新規ワークスペース名
                        </label>
                        <input
                          autoFocus
                          className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-2 ring-transparent transition focus:border-sky-300/70 focus:ring-sky-300/20"
                          id="new-workspace-title"
                          onChange={(event) => setNewWorkspaceTitle(event.target.value)}
                          value={newWorkspaceTitle}
                        />
                        <div className="mt-3 flex items-center justify-end gap-2">
                          <button
                            className="rounded-xl border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-400 hover:text-white"
                            onClick={() => {
                              setIsCreatingWorkspace(false);
                              setNewWorkspaceTitle(DEFAULT_WORKSPACE_TITLE);
                            }}
                            type="button"
                          >
                            キャンセル
                          </button>
                          <button
                            className="rounded-xl border border-sky-300/70 bg-sky-300 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-sky-200"
                            type="submit"
                          >
                            作成
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        className="rounded-2xl border border-dashed border-sky-300/45 bg-slate-900 px-3 py-3 text-left text-white shadow-[0_12px_28px_rgba(15,23,42,0.35)] transition hover:border-sky-300/80 hover:bg-slate-900 hover:text-white"
                        onClick={() => {
                          setIsCreatingWorkspace(true);
                          setNewWorkspaceTitle(DEFAULT_WORKSPACE_TITLE);
                        }}
                        type="button"
                      >
                        <span className="block text-sm font-bold">新規ワークスペースを追加</span>
                        <span className="mt-1 block text-xs text-slate-200">
                          新しいマップを作成して開きます
                        </span>
                      </button>
                    )}
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

      <main className="relative z-0 flex min-h-0 flex-1 p-4">
        <MindMapCanvas
          editingNodeId={editingNodeId}
          map={map}
          onAddChild={(nodeId, preferredDirection) => createNode(nodeId, undefined, preferredDirection)}
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

import { useEffect, useMemo, useRef, useState } from "react";

import type { MindMapNode } from "@mindmap/core";

import { ContextMenu } from "./components/ContextMenu.js";
import { MindMapCanvas } from "./components/MindMapCanvas.js";
import { useMindMap } from "./hooks/useMindMap.js";

type EditorState =
  | {
      mode: "add";
      parentId: string;
      value: string;
    }
  | {
      mode: "edit";
      nodeId: string;
      value: string;
    }
  | null;

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
  const { actions, error, map, status } = useMindMap();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const didInitializeSelection = useRef(false);
  const [contextMenu, setContextMenu] = useState<{
    node: MindMapNode | null;
    position: { x: number; y: number } | null;
  }>({
    node: null,
    position: null,
  });
  const [editor, setEditor] = useState<EditorState>(null);

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
    if (!map || !editor) {
      return;
    }

    if (editor.mode === "edit" && !map.nodes[editor.nodeId]) {
      setEditor(null);
    }

    if (editor.mode === "add" && !map.nodes[editor.parentId]) {
      setEditor(null);
    }
  }, [editor, map]);

  const openEdit = (nodeId: string) => {
    if (!map?.nodes[nodeId]) {
      return;
    }

    setContextMenu({ node: null, position: null });
    setEditor({
      mode: "edit",
      nodeId,
      value: map.nodes[nodeId].text,
    });
  };

  const openAddChild = (parentId: string) => {
    if (!map?.nodes[parentId]) {
      return;
    }

    setContextMenu({ node: null, position: null });
    setEditor({
      mode: "add",
      parentId,
      value: DEFAULT_CHILD_TEXT,
    });
  };

  const closeEditor = () => setEditor(null);

  const saveEditor = () => {
    if (!editor) {
      return;
    }

    const value = editor.value.trim();

    if (!value) {
      return;
    }

    if (editor.mode === "edit") {
      actions.editNode(editor.nodeId, value);
    } else {
      actions.addNode(editor.parentId, value);
    }

    setEditor(null);
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
    setContextMenu({ node: null, position: null });
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(map.rootId);
    }
  };

  const openContextMenu = (node: MindMapNode, position: { x: number; y: number }) => {
    setContextMenu({
      node,
      position,
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu({ node: null, position: null });
        setEditor(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const mapTitle = map?.title ?? "Mind Map";
  const nodeCount = map ? Object.keys(map.nodes).length : 0;

  return (
    <div className="relative flex h-full flex-col text-slate-100">
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
          map={map}
          onAddChild={openAddChild}
          onDeleteNode={deleteNode}
          onEditNode={openEdit}
          onOpenContextMenu={openContextMenu}
          onSelectNode={(nodeId) => setSelectedNodeId(nodeId || null)}
          selectedNodeId={selectedNodeId}
        />
      </main>

      <ContextMenu
        node={contextMenu.node}
        onAddChild={() => {
          if (contextMenu.node) {
            openAddChild(contextMenu.node.id);
          }
        }}
        onClose={() => setContextMenu({ node: null, position: null })}
        onDelete={() => {
          if (contextMenu.node) {
            deleteNode(contextMenu.node.id);
          }
        }}
        onEdit={() => {
          if (contextMenu.node) {
            openEdit(contextMenu.node.id);
          }
        }}
        position={contextMenu.position}
      />

      {editor ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm"
          onMouseDown={() => setEditor(null)}
          role="presentation"
        >
          <form
            className="w-full max-w-lg rounded-3xl border border-slate-700/80 bg-slate-950 p-5 shadow-[0_40px_120px_rgba(2,6,23,0.55)]"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              saveEditor();
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              {editor.mode === "edit" ? "Edit Node" : "Add Child"}
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-50">
              {editor.mode === "edit" ? "ノードを編集" : "子ノードを追加"}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {editor.mode === "edit"
                ? "タイトルを変更して Enter で保存します。"
                : "新しい子ノードの名前を入力して Enter で作成します。"}
            </p>

            <input
              autoFocus
              className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/20"
              onChange={(event) => {
                const value = event.target.value;
                setEditor((current) =>
                  current
                    ? {
                        ...current,
                        value,
                      }
                    : current,
                );
              }}
              placeholder="ノード名"
              value={editor.value}
            />

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500"
                onClick={closeEditor}
                type="button"
              >
                キャンセル
              </button>
              <button
                className="rounded-2xl border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-medium text-sky-100 transition hover:border-sky-300/50 hover:bg-sky-400/20"
                type="submit"
              >
                保存
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

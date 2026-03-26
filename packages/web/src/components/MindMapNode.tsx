import { useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { MindMapNode } from "@mindmap/core";

export type MindMapNodeData = {
  node: MindMapNode;
  isRoot: boolean;
  editingNodeId: string | null;
  onAddChild: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onRequestEdit: (nodeId: string) => void;
  onSaveEdit: (nodeId: string, text: string) => void;
  onSelect: (nodeId: string) => void;
};

type MindMapFlowNode = Node<MindMapNodeData, "mindMapNode">;

export function MindMapNode({ data, selected }: NodeProps<MindMapFlowNode>) {
  const { node, isRoot } = data;
  const accent = node.style?.color ?? (isRoot ? "#38bdf8" : "#7dd3fc");
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(node.text);

  useEffect(() => {
    setEditValue(node.text);
  }, [node.text]);

  useEffect(() => {
    if (data.editingNodeId !== node.id) {
      return;
    }

    setEditValue(node.text);
    setIsEditing(true);
  }, [data.editingNodeId, node.id, node.text]);

  const openEditor = (event?: MouseEvent<HTMLButtonElement | HTMLDivElement>) => {
    event?.stopPropagation();
    data.onSelect(node.id);
    data.onRequestEdit(node.id);
    setEditValue(node.text);
    setIsEditing(true);
  };

  const closeEditor = () => {
    setEditValue(node.text);
    setIsEditing(false);
  };

  const saveEdit = () => {
    const value = editValue.trim();

    if (!value) {
      closeEditor();
      return;
    }

    if (value !== node.text) {
      data.onSaveEdit(node.id, value);
    }

    setIsEditing(false);
  };

  const handleAdd = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    data.onAddChild(node.id);
  };

  const handleDelete = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    data.onDelete(node.id);
  };

  const handleSelect = () => {
    data.onSelect(node.id);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();

    if (event.key === "Enter") {
      event.preventDefault();
      saveEdit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeEditor();
    }
  };

  const preventDragStart = (
    event: MouseEvent<HTMLButtonElement | HTMLInputElement | HTMLParagraphElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className={[
        "group relative overflow-visible select-none rounded-[28px] border bg-slate-950/92 text-slate-100 shadow-[0_22px_60px_rgba(2,6,23,0.38)] backdrop-blur transition",
        isRoot ? "min-h-[120px] w-[300px] px-7 py-6" : "min-h-[84px] w-[220px] px-5 py-4",
        selected
          ? "border-sky-200/90 ring-4 ring-sky-300/75 shadow-[0_0_0_1px_rgba(186,230,253,0.95),0_26px_60px_rgba(14,165,233,0.24)]"
          : "border-slate-700/80 hover:border-slate-500/80",
      ].join(" ")}
      onClick={handleSelect}
      role="button"
      tabIndex={0}
      style={{ boxShadow: `0 0 0 1px ${accent}33, 0 24px 60px rgba(2, 6, 23, 0.35)` }}
    >
      <Handle className="!h-2 !w-2 !border-0 !bg-transparent !opacity-0" id="source-left" position={Position.Left} type="source" />
      <Handle className="!h-2 !w-2 !border-0 !bg-transparent !opacity-0" id="source-right" position={Position.Right} type="source" />
      <Handle className="!h-2 !w-2 !border-0 !bg-transparent !opacity-0" id="target-left" position={Position.Left} type="target" />
      <Handle className="!h-2 !w-2 !border-0 !bg-transparent !opacity-0" id="target-right" position={Position.Right} type="target" />

      {!isRoot ? (
        <button
          className="nodrag nopan absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-rose-400/30 bg-slate-950/90 text-sm font-semibold text-rose-200 transition hover:border-rose-300/70 hover:bg-rose-500/15 hover:text-rose-100"
          onClick={handleDelete}
          onMouseDown={preventDragStart}
          type="button"
        >
          ×
        </button>
      ) : null}

      {selected ? (
        <button
          className="nodrag nopan absolute -right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-sky-300/60 bg-sky-300 text-xl font-semibold text-slate-950 shadow-[0_12px_30px_rgba(56,189,248,0.35)] transition hover:scale-105 hover:bg-sky-200"
          onClick={handleAdd}
          onMouseDown={preventDragStart}
          type="button"
        >
          +
        </button>
      ) : null}

      <div className="flex h-full items-center">
        {isEditing ? (
          <input
            autoFocus
            className={[
              "nodrag nopan w-full min-w-0 rounded-2xl border border-sky-300/50 bg-slate-950/80 px-3 py-2 font-semibold text-slate-50 outline-none ring-2 ring-sky-300/20",
              isRoot ? "text-xl tracking-[0.02em]" : "text-base",
            ].join(" ")}
            onBlur={saveEdit}
            onChange={(event) => setEditValue(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={preventDragStart}
            onKeyDown={handleInputKeyDown}
            value={editValue}
          />
        ) : (
          <p
            className={[
              "w-full cursor-text break-words font-semibold leading-snug text-slate-50",
              isRoot ? "text-2xl tracking-[0.01em]" : "text-base",
            ].join(" ")}
            onClick={openEditor}
            onMouseDown={preventDragStart}
          >
            {node.text}
          </p>
        )}
      </div>
    </div>
  );
}

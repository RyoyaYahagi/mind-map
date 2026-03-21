import type { MouseEvent } from "react";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { MindMapNode } from "@mindmap/core";

export type MindMapNodeData = {
  node: MindMapNode;
  isRoot: boolean;
  onAddChild: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onEdit: (nodeId: string) => void;
  onOpenContextMenu: (node: MindMapNode, event: MouseEvent<HTMLDivElement>) => void;
  onSelect: (nodeId: string) => void;
};

type MindMapFlowNode = Node<MindMapNodeData, "mindMapNode">;

export function MindMapNode({ data, selected }: NodeProps<MindMapFlowNode>) {
  const { node, isRoot } = data;
  const accent = node.style?.color ?? (isRoot ? "#38bdf8" : "#7dd3fc");

  const handleEdit = (event: MouseEvent<HTMLButtonElement | HTMLDivElement>) => {
    event.stopPropagation();
    data.onEdit(node.id);
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

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    data.onOpenContextMenu(node, event);
  };

  return (
    <div
      className={[
        "group relative min-w-[240px] max-w-[300px] select-none rounded-3xl border border-slate-700/80 bg-slate-900/90 px-4 py-3 text-slate-100 shadow-[0_22px_60px_rgba(2,6,23,0.38)] backdrop-blur transition",
        selected ? "ring-2 ring-sky-400/90" : "hover:border-slate-500/80 hover:bg-slate-900",
      ].join(" ")}
      onClick={handleSelect}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleEdit}
      role="button"
      tabIndex={0}
      style={{ boxShadow: `0 0 0 1px ${accent}33, 0 24px 60px rgba(2, 6, 23, 0.35)` }}
    >
      <Handle
        className="!h-3 !w-3 !border-2 !border-slate-900 !bg-sky-400"
        id="top"
        position={Position.Top}
        type="target"
      />
      <Handle
        className="!h-3 !w-3 !border-2 !border-slate-900 !bg-sky-400"
        id="bottom"
        position={Position.Bottom}
        type="source"
      />

      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold text-slate-950"
          style={{ backgroundColor: accent }}
        >
          {node.style?.icon?.slice(0, 2) ?? node.text.trim().slice(0, 2) ?? "•"}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold tracking-wide text-slate-50">
              {node.text}
            </p>
            {isRoot ? (
              <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300">
                Root
              </span>
            ) : null}
          </div>

          {node.notes ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{node.notes}</p>
          ) : (
            <p className="mt-1 text-xs leading-5 text-slate-500">
              右クリックで操作 / ダブルクリックで編集
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
        <button
          className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-[11px] font-medium text-slate-200 transition hover:border-sky-400/50 hover:text-sky-200"
          onClick={handleAdd}
          type="button"
        >
          子を追加
        </button>
        <button
          className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-[11px] font-medium text-slate-200 transition hover:border-sky-400/50 hover:text-sky-200"
          onClick={handleEdit}
          type="button"
        >
          編集
        </button>
        <button
          className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-[11px] font-medium text-rose-200 transition hover:border-rose-400/40 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={isRoot}
          onClick={handleDelete}
          type="button"
        >
          削除
        </button>
      </div>
    </div>
  );
}

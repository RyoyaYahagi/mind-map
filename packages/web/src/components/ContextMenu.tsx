type ContextMenuProps = {
  onAddRootNode: () => void;
  onClose: () => void;
  position: {
    x: number;
    y: number;
  } | null;
};

export function ContextMenu({ onAddRootNode, onClose, position }: ContextMenuProps) {
  if (!position) {
    return null;
  }

  const x = Math.min(position.x, window.innerWidth - 248);
  const y = Math.min(position.y, window.innerHeight - 160);

  return (
    <div className="fixed inset-0 z-40" onMouseDown={onClose} role="presentation">
      <div
        className="absolute w-60 rounded-2xl border border-slate-700/80 bg-slate-950/95 p-2 shadow-[0_30px_80px_rgba(2,6,23,0.45)] backdrop-blur"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        style={{ left: x, top: y }}
      >
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/80 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Canvas
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-100">空白スペース</p>
        </div>

        <div className="mt-2 grid gap-1">
          <button
            className="rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800/80 hover:text-sky-200"
            onClick={onAddRootNode}
            type="button"
          >
            ルートノードを追加
          </button>
        </div>
      </div>
    </div>
  );
}

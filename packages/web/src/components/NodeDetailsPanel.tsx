import type { MindMapNode } from "@mindmap/core";

type NodeDetailsPanelProps = {
  node: MindMapNode | null;
  onChangeNotes: (nodeId: string, notes: string) => void;
};

export function NodeDetailsPanel({ node, onChangeNotes }: NodeDetailsPanelProps) {
  const notes = node?.notes ?? "";
  const hasNotes = notes.trim().length > 0;

  return (
    <aside className="flex w-full shrink-0 flex-col rounded-3xl border border-slate-800/80 bg-slate-950/75 p-5 shadow-[0_30px_80px_rgba(15,23,42,0.35)] backdrop-blur lg:w-[360px]">
      <div className="border-b border-slate-800/80 pb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-500">
          Node Details
        </p>
        <h2 className="mt-2 text-lg font-semibold text-slate-50">
          {node ? node.text : "ノードを選択してください"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {node
            ? "このノードの詳細をプレーンテキストで記録できます。入力内容はローカルに即時保存されます。"
            : "マップ上のノードを選ぶと、このパネルで詳細を編集できます。"}
        </p>
      </div>

      {node ? (
        <div className="flex min-h-0 flex-1 flex-col pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="rounded-full border border-slate-700/80 bg-slate-900/80 px-3 py-1 text-xs text-slate-300">
              {node.parent ? "子ノード" : "ルートノード"}
            </span>
            <span
              className={[
                "rounded-full border px-3 py-1 text-xs",
                hasNotes
                  ? "border-sky-400/30 bg-sky-400/10 text-sky-200"
                  : "border-slate-700/80 bg-slate-900/80 text-slate-400",
              ].join(" ")}
            >
              {hasNotes ? "詳細あり" : "詳細なし"}
            </span>
          </div>

          <label className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500" htmlFor="node-details-notes">
            詳細メモ
          </label>
          <textarea
            className="min-h-[220px] w-full flex-1 resize-none rounded-3xl border border-slate-700/80 bg-slate-950/90 px-4 py-3 text-sm leading-6 text-slate-100 outline-none ring-2 ring-transparent transition focus:border-sky-300/60 focus:ring-sky-300/15"
            id="node-details-notes"
            onChange={(event) => onChangeNotes(node.id, event.target.value)}
            placeholder="このノードで扱いたい論点、補足、具体例などを書いておけます。"
            value={notes}
          />
          <p className="mt-3 text-xs leading-5 text-slate-500">
            改行を含めて保存できます。ノードの表示サイズは変えず、詳細はこのパネルに集約します。
          </p>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="rounded-3xl border border-dashed border-slate-700/80 bg-slate-900/60 px-5 py-6 text-center">
            <p className="text-sm font-semibold text-slate-200">詳細パネルは待機中です</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              ノードをクリックするか、ノード右上の詳細ボタンから開けます。
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}

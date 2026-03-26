# Web UI 改善: 横レイアウト・インライン編集・ドラッグ操作

## Context

現在の Web UI は縦方向ツリーレイアウト、モーダルダイアログによるノード編集、ノード移動不可という状態。これをマインドマップらしい横方向レイアウト、インライン編集、ドラッグ操作に改善する。

## 変更概要

1. **横レイアウト**: ルートを中央に配置し、子ノードが左右に広がる
2. **ルートノードの移動**: ルートをドラッグして位置変更可能に（ツリー全体が追従）
3. **インライン編集**: ダブルクリックでその場でテキスト編集（モーダル廃止）
4. **ドラッグで親変更**: ノードをドラッグ＆ドロップして別ノードの子に移動

## 対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `packages/web/src/hooks/useMindMap.ts` | `moveNode` アクション追加 |
| `packages/web/src/components/MindMapNode.tsx` | ハンドル左右化、インライン編集 |
| `packages/web/src/components/MindMapCanvas.tsx` | レイアウト全面書き換え、ドラッグ制御 |
| `packages/web/src/App.tsx` | 編集モーダル削除、新コールバック接続 |

サーバー側変更なし（`node:move` は既に実装済み）。

---

## Step 1: `useMindMap.ts` — moveNode 追加

`actions` の useMemo に追加:

```typescript
moveNode: (nodeId: string, newParentId: string) =>
  send({ type: "node:move", payload: { nodeId, newParentId } }),
```

---

## Step 2: `MindMapNode.tsx` — ハンドル左右化 + インライン編集

### ハンドル

ノードデータに `side: "left" | "right" | "root"` を追加。side に応じて Handle を切り替え:

- **root**: `Position.Left`(source) + `Position.Right`(source) の2つ
- **right**: `Position.Left`(target) + `Position.Right`(source)
- **left**: `Position.Right`(target) + `Position.Left`(source)

各 Handle に `id="left"` / `id="right"` を付与し、Edge の `sourceHandle`/`targetHandle` と対応させる。

### インライン編集

ノードコンポーネント内にローカルステート追加:

```typescript
const [isEditing, setIsEditing] = useState(false);
const [editValue, setEditValue] = useState(data.node.text);
```

- **ダブルクリック**: `setIsEditing(true)`, `setEditValue(node.text)`
- **編集中**: テキスト `<p>` を `<input>` に差し替え、`autoFocus`
- **Enter**: `data.onSaveEdit(node.id, editValue.trim())` → `setIsEditing(false)`
- **Escape**: `setIsEditing(false)`（保存しない）
- **onBlur**: 保存して閉じる
- `event.stopPropagation()` で React Flow のキーボード干渉を防止

`MindMapNodeData` の型変更: `onEdit` → `onSaveEdit: (nodeId: string, text: string) => void`

外部から編集モードを起動するために `editingNodeId: string | null` を props 経由で受け取り、`useEffect` で自身の ID と一致したら `setIsEditing(true)` にする（コンテキストメニューの「編集」用）。

---

## Step 3: `MindMapCanvas.tsx` — 横レイアウト + ドラッグ

### レイアウト定数

```typescript
const NODE_WIDTH = 220;
const NODE_HEIGHT = 80;
const LEVEL_GAP = 280;   // 親子間の水平距離
const SIBLING_GAP = 24;  // 兄弟間の垂直距離
```

### 子ノードの左右振り分け

```typescript
const rightChildren = root.children.slice(0, Math.ceil(n / 2));
const leftChildren = root.children.slice(Math.ceil(n / 2));
```

### measureSubtreeHeight (新)

縦方向の占有高さを再帰計測:
- リーフ: `NODE_HEIGHT`
- 子あり: `Σ(子の高さ) + SIBLING_GAP * (子数 - 1)`, 最低 `NODE_HEIGHT`

### placeNodes (新)

右側: x を `+LEVEL_GAP` ずつ増加、子を縦方向に積み上げ
左側: x を `-LEVEL_GAP` ずつ減少、同様に積み上げ
ルート: `(0, 0)` に配置（fitView で自動センタリング）

### エッジ

- タイプ: `bezier`（マインドマップらしい曲線）
- 右側エッジ: `sourceHandle: "right"`, `targetHandle: "left"`
- 左側エッジ: `sourceHandle: "left"`, `targetHandle: "right"`

### ドラッグ制御

React Flow を `nodesDraggable={true}` に変更。`applyNodeChanges` で制御されたノード状態を管理:

```typescript
const [nodesState, setNodesState] = useState<Node[]>([]);
useEffect(() => { setNodesState(layoutNodes); }, [layoutNodes]);
const onNodesChange = useCallback((changes) => {
  setNodesState(prev => applyNodeChanges(changes, prev));
}, []);
```

### ドラッグ完了時のリペアレント

`onNodeDragStop` で最も近いノード（150px 以内）を検出:
- 自身の子孫は除外（循環防止）
- ルートノードのドラッグ時はリペアレントしない
- 現在の親と同じなら何もしない
- 有効なターゲットがあれば `moveNode(nodeId, targetId)` を呼ぶ

### ルートノード移動

ルートのドラッグは「ツリー全体のオフセット」として扱う:
- `rootOffset` state を保持
- レイアウト計算時に全ノード座標に `rootOffset` を加算
- ルートの `onNodeDragStop` で `rootOffset` を更新

### fitView 制御

ドラッグ中に fitView が発火しないよう、`isDragging` ref でガード。ドラッグ開始で true、ドラッグ終了で false。`ViewportRefitter` は `isDragging` が false の時のみ fitView 実行。

---

## Step 4: `App.tsx` — モーダル廃止 + 新コールバック

1. `EditorState` 型から `"edit"` を削除 → `"add"` のみ残す
2. `openEdit` 関数を削除
3. 新しいコールバック:
   - `onSaveEdit(nodeId, text)` → `actions.editNode(nodeId, text)` を直接呼ぶ
   - `onMoveNode(nodeId, newParentId)` → `actions.moveNode(nodeId, newParentId)`
4. `editingNodeId` state 追加 → コンテキストメニューの「編集」で設定
5. MindMapCanvas に `editingNodeId`, `onSaveEdit`, `onMoveNode` を渡す
6. 編集モーダルのJSXは add モード専用に縮小

---

## 検証方法

1. **横レイアウト**: `mm serve` → ブラウザでルートが中央、子が左右に展開されることを確認
2. **インライン編集**: ノードをダブルクリック → テキストがその場で編集可能 → Enter で保存
3. **ドラッグ移動**: ノードをドラッグして別ノード付近にドロップ → 親が変更される
4. **ルート移動**: ルートノードをドラッグ → ツリー全体が移動
5. **CLI連携**: 別ターミナルで `mm node add` → Web UI にリアルタイム反映（横レイアウトで）
6. **ビルド**: `npm run build` が成功すること

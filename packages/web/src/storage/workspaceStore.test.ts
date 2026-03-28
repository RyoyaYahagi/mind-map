import { describe, expect, it } from "vitest";

import { createMindMap } from "@mindmap/core";

import {
  WORKSPACE_STORAGE_KEY,
  addDetachedNodeToActiveMap,
  addNodeToActiveMap,
  createWorkspace,
  ensureWorkspaceStore,
  fromBridgePayload,
  getActiveMap,
  listWorkspaceSummaries,
  mergeWorkspaceStores,
  openWorkspace,
  readWorkspaceStore,
  saveNodeNotesInActiveMap,
  setNodePositionInActiveMap,
  toBridgePayload,
  writeWorkspaceStore,
  type WorkspaceStore,
} from "./workspaceStore.js";

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe("workspaceStore", () => {
  it("creates a default workspace when storage is empty", () => {
    const storage = new MemoryStorage();
    const store = readWorkspaceStore(storage);
    const activeMap = getActiveMap(store);

    expect(activeMap?.title).toBe("新しいワークスペース");
    expect(listWorkspaceSummaries(store)).toHaveLength(1);
  });

  it("persists the default workspace on first initialization", () => {
    const storage = new MemoryStorage();
    const first = ensureWorkspaceStore(storage);
    const second = ensureWorkspaceStore(storage);

    expect(first.activeMapId).toBe(second.activeMapId);
    expect(storage.getItem(WORKSPACE_STORAGE_KEY)).not.toBeNull();
  });

  it("persists and restores active workspace state", () => {
    const storage = new MemoryStorage();
    const firstStore = readWorkspaceStore(storage);
    const created = createWorkspace(firstStore, "公開用マップ");
    writeWorkspaceStore(storage, created.store);

    const restored = readWorkspaceStore(storage);

    expect(restored.activeMapId).toBe(created.map.id);
    expect(getActiveMap(restored)?.title).toBe("公開用マップ");
    expect(listWorkspaceSummaries(restored)).toHaveLength(2);
  });

  it("serializes and restores bridge payloads", () => {
    const storage = new MemoryStorage();
    const initialStore = ensureWorkspaceStore(storage);
    const created = createWorkspace(initialStore, "公開用マップ");
    const payload = toBridgePayload(created.store);
    const restored = fromBridgePayload(payload);

    expect(payload.version).toBe(1);
    expect(restored.activeMapId).toBe(created.store.activeMapId);
    expect(getActiveMap(restored)?.title).toBe("公開用マップ");
  });

  it("falls back to a default workspace when stored data is invalid", () => {
    const storage = new MemoryStorage();
    storage.setItem(WORKSPACE_STORAGE_KEY, "{\"version\":1,\"maps\":{\"broken\":\"{\"}}");

    const restored = readWorkspaceStore(storage);

    expect(getActiveMap(restored)?.title).toBe("新しいワークスペース");
    expect(listWorkspaceSummaries(restored)).toHaveLength(1);
  });

  it("updates nodes in the active workspace and keeps positions", () => {
    const initialMap = createMindMap("Root");
    const initialStore: WorkspaceStore = {
      activeMapId: initialMap.id,
      maps: {
        [initialMap.id]: initialMap,
      },
    };

    const added = addNodeToActiveMap(initialStore, initialMap.rootId, "Child", { x: 280, y: 120 });
    expect(added).not.toBeNull();

    const moved = setNodePositionInActiveMap(added!.store, added!.value.nodeId, { x: 480, y: 240 });
    expect(moved).not.toBeNull();

    const activeMap = getActiveMap(moved!.store);

    expect(activeMap?.nodes[added!.value.nodeId]?.position).toEqual({ x: 480, y: 240 });
  });

  it("adds detached top-level nodes to the active workspace", () => {
    const initialMap = createMindMap("Root");
    const initialStore: WorkspaceStore = {
      activeMapId: initialMap.id,
      maps: {
        [initialMap.id]: initialMap,
      },
    };

    const added = addDetachedNodeToActiveMap(initialStore, "Detached", { x: 720, y: 360 });

    expect(added).not.toBeNull();
    expect(added!.store.maps[initialMap.id]?.nodes[added!.value.nodeId]?.parent).toBeNull();
    expect(added!.store.maps[initialMap.id]?.nodes[added!.value.nodeId]?.position).toEqual({ x: 720, y: 360 });
  });

  it("saves notes for the selected node and preserves them after persistence", () => {
    const storage = new MemoryStorage();
    const initialStore = ensureWorkspaceStore(storage);
    const rootId = initialStore.activeMapId ? getActiveMap(initialStore)?.rootId ?? "" : "";

    const updated = saveNodeNotesInActiveMap(initialStore, rootId, "詳細メモ\n複数行");

    expect(updated).not.toBeNull();

    writeWorkspaceStore(storage, updated!.store);
    const restored = readWorkspaceStore(storage);

    expect(getActiveMap(restored)?.nodes[rootId]?.notes).toBe("詳細メモ\n複数行");
  });

  it("opens an existing workspace by id", () => {
    const storage = new MemoryStorage();
    const firstStore = readWorkspaceStore(storage);
    const created = createWorkspace(firstStore, "Second");
    const reopened = openWorkspace(created.store, firstStore.activeMapId ?? "");

    expect(reopened.map?.id).toBe(firstStore.activeMapId);
    expect(reopened.store.activeMapId).toBe(firstStore.activeMapId);
  });

  it("merges imported workspaces and prefers the incoming active map", () => {
    const storage = new MemoryStorage();
    const localStore = ensureWorkspaceStore(storage);
    const imported = createWorkspace(readWorkspaceStore(new MemoryStorage()), "CLI Map");

    const merged = mergeWorkspaceStores(localStore, imported.store);

    expect(listWorkspaceSummaries(merged)).toHaveLength(3);
    expect(getActiveMap(merged)?.title).toBe("CLI Map");
  });

  it("updates the current active workspace after workspace switches", () => {
    const initial = readWorkspaceStore(new MemoryStorage());
    const created = createWorkspace(initial, "Second");

    const staleUpdate = addNodeToActiveMap(created.store, created.map.rootId, "Child");

    expect(staleUpdate).not.toBeNull();
    expect(staleUpdate?.map.id).toBe(created.map.id);
    expect(staleUpdate?.map.nodes[staleUpdate.value.nodeId]?.parent).toBe(created.map.rootId);
  });

  it("ignores stale node-targeted updates after workspace switches", () => {
    const initial = readWorkspaceStore(new MemoryStorage());
    const initialActiveMap = getActiveMap(initial);
    const created = createWorkspace(initial, "Second");

    const staleUpdate = saveNodeNotesInActiveMap(created.store, initialActiveMap?.rootId ?? "", "stale note");

    expect(staleUpdate).toBeNull();
    expect(getActiveMap(created.store)?.id).toBe(created.map.id);
    expect(created.store.maps[initialActiveMap?.id ?? ""]?.nodes[initialActiveMap?.rootId ?? ""]?.notes).toBeUndefined();
  });

  it("returns null when the active workspace does not contain the target node", () => {
    const initial = readWorkspaceStore(new MemoryStorage());

    const staleUpdate = addNodeToActiveMap(initial, "missing-node-id", "Child");

    expect(staleUpdate).toBeNull();
  });
});

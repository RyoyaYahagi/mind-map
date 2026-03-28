import { describe, expect, it } from "vitest";

import { createMindMap } from "@mindmap/core";

import {
  WORKSPACE_STORAGE_KEY,
  addNodeToActiveMap,
  createWorkspace,
  getActiveMap,
  listWorkspaceSummaries,
  openWorkspace,
  readWorkspaceStore,
  setNodePositionInActiveMap,
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
    const moved = setNodePositionInActiveMap(added.store, added.value.nodeId, { x: 480, y: 240 });
    const activeMap = getActiveMap(moved.store);

    expect(activeMap?.nodes[added.value.nodeId]?.position).toEqual({ x: 480, y: 240 });
  });

  it("opens an existing workspace by id", () => {
    const storage = new MemoryStorage();
    const firstStore = readWorkspaceStore(storage);
    const created = createWorkspace(firstStore, "Second");
    const reopened = openWorkspace(created.store, firstStore.activeMapId ?? "");

    expect(reopened.map?.id).toBe(firstStore.activeMapId);
    expect(reopened.store.activeMapId).toBe(firstStore.activeMapId);
  });
});

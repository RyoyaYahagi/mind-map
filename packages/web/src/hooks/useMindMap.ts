import { useCallback, useEffect, useMemo, useState } from "react";

import type { MindMap, NodePosition } from "@mindmap/core";

import {
  addNodeToActiveMap,
  createWorkspace,
  deleteNodeFromActiveMap,
  editNodeInActiveMap,
  ensureWorkspaceStore,
  getActiveMap,
  listWorkspaceSummaries,
  moveNodeInActiveMap,
  openWorkspace,
  readWorkspaceStore,
  saveNodeNotesInActiveMap,
  setNodePositionInActiveMap,
  writeWorkspaceStore,
  WORKSPACE_STORAGE_KEY,
  type WorkspaceStore,
  type WorkspaceSummary,
} from "../storage/workspaceStore.js";

export type { WorkspaceSummary } from "../storage/workspaceStore.js";

export type MindMapStatus = "open" | "local" | "error";

export const useMindMap = () => {
  const [map, setMap] = useState<MindMap | null>(null);
  const [lastAddedNode, setLastAddedNode] = useState<{ nodeId: string; requestId: string } | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [status, setStatus] = useState<MindMapStatus>("local");
  const [serverError, setServerError] = useState<string | null>(null);

  const getStorage = useCallback((): Storage | null => {
    if (typeof window === "undefined") {
      return null;
    }

    return window.localStorage;
  }, []);

  const syncFromStore = useCallback((store: WorkspaceStore) => {
    setMap(getActiveMap(store));
    setWorkspaces(listWorkspaceSummaries(store));
    setStatus("local");
    setServerError(null);
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const storage = getStorage();

      if (!storage) {
        throw new Error("ブラウザのストレージへアクセスできません");
      }

      const store = ensureWorkspaceStore(storage);
      syncFromStore(store);
    } catch (error) {
      setStatus("error");
      setServerError(error instanceof Error ? error.message : "ワークスペースの読み込みに失敗しました");
    }
  }, [getStorage, syncFromStore]);

  useEffect(() => {
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) {
        return;
      }

      if (event.key !== null && event.key !== WORKSPACE_STORAGE_KEY) {
        return;
      }

      void refreshWorkspaces();
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refreshWorkspaces]);

  const applyStoreChange = <T,>(
    mutate: (store: WorkspaceStore) => { store: WorkspaceStore; value: T } | null,
  ): T | null => {
    try {
      const storage = getStorage();

      if (!storage) {
        throw new Error("ブラウザのストレージへアクセスできません");
      }

      const store = ensureWorkspaceStore(storage);
      const result = mutate(store);

      if (!result) {
        return null;
      }

      const nextStore = writeWorkspaceStore(storage, result.store);

      syncFromStore(nextStore);
      return result.value;
    } catch (error) {
      setStatus("error");
      setServerError(error instanceof Error ? error.message : "ワークスペースの更新に失敗しました");
      return null;
    }
  };

  const actions = useMemo(
    () => ({
      addNode: (parentId: string, text: string, position?: NodePosition) => {
        const requestId = crypto.randomUUID();
        const targetMapId = map?.id;
        const added = applyStoreChange((store) => {
          const result = addNodeToActiveMap(store, parentId, text, position, targetMapId);

          if (!result) {
            return null;
          }

          return {
            store: result.store,
            value: {
              nodeId: result.value.nodeId,
              requestId,
            },
          };
        });

        if (!added) {
          return null;
        }

        setLastAddedNode(added);
        return added.requestId;
      },
      deleteNode: (nodeId: string) =>
        applyStoreChange((store) => {
          const result = deleteNodeFromActiveMap(store, nodeId, map?.id);

          if (!result) {
            return null;
          }

          return {
            store: result.store,
            value: result.value,
          };
        }) ?? false,
      editNode: (nodeId: string, text: string) =>
        applyStoreChange((store) => {
          const result = editNodeInActiveMap(store, nodeId, text, map?.id);

          if (!result) {
            return null;
          }

          return {
            store: result.store,
            value: result.value,
          };
        }) ?? false,
      setNodeNotes: (nodeId: string, notes: string) =>
        applyStoreChange((store) => {
          const result = saveNodeNotesInActiveMap(store, nodeId, notes, map?.id);

          if (!result) {
            return null;
          }

          return {
            store: result.store,
            value: result.value,
          };
        }) ?? false,
      moveNode: (nodeId: string, newParentId: string) =>
        applyStoreChange((store) => {
          const result = moveNodeInActiveMap(store, nodeId, newParentId, map?.id);

          if (!result) {
            return null;
          }

          return {
            store: result.store,
            value: result.value,
          };
        }) ?? false,
      setNodePosition: (nodeId: string, position: NodePosition) =>
        applyStoreChange((store) => {
          const result = setNodePositionInActiveMap(store, nodeId, position, map?.id);

          if (!result) {
            return null;
          }

          return {
            store: result.store,
            value: result.value,
          };
        }) ?? false,
      openWorkspace: (mapId: string) =>
        applyStoreChange((store) => {
          const result = openWorkspace(store, mapId);

          return {
            store: result.store,
            value: result.map !== null,
          };
        }) ?? false,
      createWorkspace: async (title?: string) => {
        const created = applyStoreChange((store) => {
          const result = createWorkspace(store, title);

          return {
            store: result.store,
            value: result.summary,
          };
        });

        if (!created) {
          throw new Error("ワークスペースの作成に失敗しました");
        }

        return created;
      },
    }),
    [applyStoreChange, map?.id],
  );

  return {
    actions,
    error: serverError,
    lastAddedNode,
    map,
    refreshWorkspaces,
    status,
    workspaces,
  };
};

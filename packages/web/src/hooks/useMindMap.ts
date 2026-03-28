import { useCallback, useEffect, useMemo, useState } from "react";

import type { MindMap, NodePosition } from "@mindmap/core";

import {
  addDetachedNodeToActiveMap,
  addNodeToActiveMap,
  createWorkspace,
  deleteNodeFromActiveMap,
  editNodeInActiveMap,
  ensureWorkspaceStore,
  fromBridgePayload,
  getActiveMap,
  listWorkspaceSummaries,
  mergeWorkspaceStores,
  moveNodeInActiveMap,
  openWorkspace,
  saveNodeNotesInActiveMap,
  setNodePositionInActiveMap,
  toBridgePayload,
  writeWorkspaceStore,
  WORKSPACE_STORAGE_KEY,
  type WorkspaceStore,
  type WorkspaceSummary,
} from "../storage/workspaceStore.js";

export type { WorkspaceSummary } from "../storage/workspaceStore.js";

export type MindMapStatus = "open" | "local" | "error";
export type BridgeSyncStatus = "idle" | "importing" | "exporting";

const checkBridgeAvailability = async (): Promise<boolean> => {
  try {
    const response = await fetch("/api/bridge/workspaces", {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return false;
    }

    fromBridgePayload(await response.json());
    return true;
  } catch {
    return false;
  }
};

const readApiError = async (response: Response): Promise<string> => {
  try {
    const payload = await response.json() as { error?: string; message?: string };
    return payload.error ?? payload.message ?? `リクエストに失敗しました (${response.status})`;
  } catch {
    return `リクエストに失敗しました (${response.status})`;
  }
};

export const useMindMap = () => {
  const [map, setMap] = useState<MindMap | null>(null);
  const [lastAddedNode, setLastAddedNode] = useState<{ nodeId: string; requestId: string } | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [status, setStatus] = useState<MindMapStatus>("local");
  const [serverError, setServerError] = useState<string | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeSyncStatus>("idle");
  const [bridgeMessage, setBridgeMessage] = useState<string | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [isBridgeAvailable, setIsBridgeAvailable] = useState(false);

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
    void (async () => {
      setIsBridgeAvailable(await checkBridgeAvailability());
    })();
  }, []);

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
        const added = applyStoreChange((store) => {
          const result = addNodeToActiveMap(store, parentId, text, position);

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
      addDetachedNode: (text: string, position?: NodePosition) => {
        const requestId = crypto.randomUUID();
        const added = applyStoreChange((store) => {
          const result = addDetachedNodeToActiveMap(store, text, position);

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
          const result = deleteNodeFromActiveMap(store, nodeId);

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
          const result = editNodeInActiveMap(store, nodeId, text);

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
          const result = saveNodeNotesInActiveMap(store, nodeId, notes);

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
          const result = moveNodeInActiveMap(store, nodeId, newParentId);

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
          const result = setNodePositionInActiveMap(store, nodeId, position);

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
      importFromCliBridge: async () => {
        try {
          setBridgeStatus("importing");
          setBridgeError(null);
          setBridgeMessage(null);

          const storage = getStorage();

          if (!storage) {
            throw new Error("ブラウザのストレージへアクセスできません");
          }

          const response = await fetch("/api/bridge/workspaces");

          if (!response.ok) {
            throw new Error(await readApiError(response));
          }

          const payload = await response.json();
          const importedStore = fromBridgePayload(payload);
          const currentStore = ensureWorkspaceStore(storage);
          const mergedStore = mergeWorkspaceStores(currentStore, importedStore);
          const nextStore = writeWorkspaceStore(storage, mergedStore);

          syncFromStore(nextStore);
          setBridgeMessage(`CLI保存領域から ${Object.keys(importedStore.maps).length} 件のワークスペースを取り込みました`);
        } catch (error) {
          setBridgeError(
            error instanceof Error ? error.message : "CLI保存領域からの取り込みに失敗しました",
          );
        } finally {
          setBridgeStatus("idle");
        }
      },
      exportToCliBridge: async () => {
        try {
          setBridgeStatus("exporting");
          setBridgeError(null);
          setBridgeMessage(null);

          const storage = getStorage();

          if (!storage) {
            throw new Error("ブラウザのストレージへアクセスできません");
          }

          const store = ensureWorkspaceStore(storage);
          const response = await fetch("/api/bridge/workspaces", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(toBridgePayload(store)),
          });

          if (!response.ok) {
            throw new Error(await readApiError(response));
          }

          const result = await response.json() as { importedMapCount?: number };
          const exportedCount = result.importedMapCount ?? Object.keys(store.maps).length;
          setBridgeMessage(`ブラウザの ${exportedCount} 件のワークスペースをCLI保存領域へ書き出しました`);
        } catch (error) {
          setBridgeError(
            error instanceof Error ? error.message : "CLI保存領域への書き出しに失敗しました",
          );
        } finally {
          setBridgeStatus("idle");
        }
      },
    }),
    [applyStoreChange, getStorage, syncFromStore],
  );

  return {
    actions,
    bridge: {
      available: isBridgeAvailable,
      error: bridgeError,
      message: bridgeMessage,
      status: bridgeStatus,
    },
    error: serverError,
    lastAddedNode,
    map,
    refreshWorkspaces,
    status,
    workspaces,
  };
};

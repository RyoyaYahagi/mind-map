import {
  addDetachedNode,
  addNode,
  createMindMap,
  deserializeWorkspaceBridgePayload,
  deleteNode,
  editNode,
  moveNode,
  serializeWorkspaceBridgePayload,
  setNote,
  setNodePosition,
  type MindMap,
  type NodePosition,
  type WorkspaceBridgePayload,
} from "@mindmap/core";

export type WorkspaceSummary = {
  id: string;
  title: string;
  filePath: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  isActive: boolean;
};

export type WorkspaceStore = {
  activeMapId: string | null;
  maps: Record<string, MindMap>;
};

type PersistedWorkspaceStore = WorkspaceBridgePayload;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

type ActiveMapMutationResult<T> = {
  map: MindMap;
  store: WorkspaceStore;
  value: T;
};

export const WORKSPACE_STORAGE_KEY = "mindmap:workspaces:v1";
const DEFAULT_WORKSPACE_TITLE = "新しいワークスペース";

const createDefaultStore = (): WorkspaceStore => {
  const map = createMindMap(DEFAULT_WORKSPACE_TITLE);

  return {
    activeMapId: map.id,
    maps: {
      [map.id]: map,
    },
  };
};

const sortMaps = (maps: Record<string, MindMap>): MindMap[] =>
  Object.values(maps).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const getFallbackActiveMapId = (store: WorkspaceStore): string | null => sortMaps(store.maps)[0]?.id ?? null;

const normalizeStore = (store: WorkspaceStore): WorkspaceStore => {
  if (Object.keys(store.maps).length === 0) {
    return createDefaultStore();
  }

  return {
    ...store,
    activeMapId:
      store.activeMapId && store.maps[store.activeMapId]
        ? store.activeMapId
        : getFallbackActiveMapId(store),
  };
};

const parseStore = (raw: string | null): WorkspaceStore | null => {
  if (!raw) {
    return null;
  }

  try {
    return normalizeStore(deserializeWorkspaceBridgePayload(JSON.parse(raw)));
  } catch {
    return null;
  }
};

const persistStore = (storage: StorageLike, store: WorkspaceStore): void => {
  const payload: PersistedWorkspaceStore = serializeWorkspaceBridgePayload(store);

  storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(payload));
};

const updateStoreWithMap = (store: WorkspaceStore, map: MindMap): WorkspaceStore =>
  normalizeStore({
    activeMapId: map.id,
    maps: {
      ...store.maps,
      [map.id]: map,
    },
  });

const getActiveMapOrThrow = (store: WorkspaceStore): MindMap => {
  const activeMap = getActiveMap(store);

  if (!activeMap) {
    throw new Error("アクティブなワークスペースが見つかりません");
  }

  return activeMap;
};

const createWorkspaceSummary = (map: MindMap, activeMapId: string | null): WorkspaceSummary => ({
  id: map.id,
  title: map.title,
  filePath: `browser://local/${map.id}.mindmap.json`,
  createdAt: map.createdAt,
  updatedAt: map.updatedAt,
  nodeCount: Object.keys(map.nodes).length,
  isActive: activeMapId === map.id,
});

export const readWorkspaceStore = (storage: StorageLike): WorkspaceStore =>
  parseStore(storage.getItem(WORKSPACE_STORAGE_KEY)) ?? createDefaultStore();

export const writeWorkspaceStore = (storage: StorageLike, store: WorkspaceStore): WorkspaceStore => {
  const normalizedStore = normalizeStore(store);
  persistStore(storage, normalizedStore);
  return normalizedStore;
};

export const ensureWorkspaceStore = (storage: StorageLike): WorkspaceStore => {
  const existing = parseStore(storage.getItem(WORKSPACE_STORAGE_KEY));

  if (existing) {
    return existing;
  }

  return writeWorkspaceStore(storage, createDefaultStore());
};

export const toBridgePayload = (store: WorkspaceStore): WorkspaceBridgePayload =>
  serializeWorkspaceBridgePayload(store);

export const fromBridgePayload = (payload: unknown): WorkspaceStore =>
  normalizeStore(deserializeWorkspaceBridgePayload(payload));

export const mergeWorkspaceStores = (
  current: WorkspaceStore,
  incoming: WorkspaceStore,
): WorkspaceStore =>
  normalizeStore({
    activeMapId: incoming.activeMapId ?? current.activeMapId,
    maps: {
      ...current.maps,
      ...incoming.maps,
    },
  });

export const listWorkspaceSummaries = (store: WorkspaceStore): WorkspaceSummary[] =>
  sortMaps(store.maps).map((map) => createWorkspaceSummary(map, store.activeMapId));

export const getActiveMap = (store: WorkspaceStore): MindMap | null => {
  if (store.activeMapId && store.maps[store.activeMapId]) {
    return store.maps[store.activeMapId];
  }

  return sortMaps(store.maps)[0] ?? null;
};

export const createWorkspace = (
  store: WorkspaceStore,
  title?: string,
): { map: MindMap; store: WorkspaceStore; summary: WorkspaceSummary } => {
  const map = createMindMap(title?.trim() || DEFAULT_WORKSPACE_TITLE);
  const nextStore = updateStoreWithMap(store, map);

  return {
    map,
    store: nextStore,
    summary: createWorkspaceSummary(map, map.id),
  };
};

export const openWorkspace = (
  store: WorkspaceStore,
  mapId: string,
): { map: MindMap | null; store: WorkspaceStore } => {
  const map = store.maps[mapId] ?? null;

  if (!map) {
    return {
      map: null,
      store,
    };
  }

  return {
    map,
    store: {
      ...store,
      activeMapId: mapId,
    },
  };
};

export const updateMap = <T>(
  store: WorkspaceStore,
  mutate: (map: MindMap) => { map: MindMap; value: T },
): ActiveMapMutationResult<T> | null => {
  const currentMap = getActiveMap(store);

  if (!currentMap) {
    return null;
  }

  const result = mutate(currentMap);

  return {
    map: result.map,
    store: updateStoreWithMap(store, result.map),
    value: result.value,
  };
};

export const addNodeToActiveMap = (
  store: WorkspaceStore,
  parentId: string,
  text: string,
  position?: NodePosition,
): ActiveMapMutationResult<{ nodeId: string }> | null => {
  const targetMap = getActiveMap(store);

  if (!targetMap?.nodes[parentId]) {
    return null;
  }

  return updateMap(store, (map) => {
    const result = addNode(map, parentId, text, position);

    return {
      map: result.map,
      value: {
        nodeId: result.node.id,
      },
    };
  });
};

export const addDetachedNodeToActiveMap = (
  store: WorkspaceStore,
  text: string,
  position?: NodePosition,
): ActiveMapMutationResult<{ nodeId: string }> | null =>
  updateMap(store, (map) => {
    const result = addDetachedNode(map, text, position);

    return {
      map: result.map,
      value: {
        nodeId: result.node.id,
      },
    };
  });

export const editNodeInActiveMap = (
  store: WorkspaceStore,
  nodeId: string,
  text: string,
): ActiveMapMutationResult<boolean> | null => {
  const targetMap = getActiveMap(store);

  if (!targetMap?.nodes[nodeId]) {
    return null;
  }

  return updateMap(store, (map) => ({
    map: editNode(map, nodeId, text),
    value: true,
  }));
};

export const saveNodeNotesInActiveMap = (
  store: WorkspaceStore,
  nodeId: string,
  notes: string,
): ActiveMapMutationResult<boolean> | null => {
  const targetMap = getActiveMap(store);

  if (!targetMap?.nodes[nodeId]) {
    return null;
  }

  return updateMap(store, (map) => ({
    map: setNote(map, nodeId, notes),
    value: true,
  }));
};

export const deleteNodeFromActiveMap = (
  store: WorkspaceStore,
  nodeId: string,
): ActiveMapMutationResult<boolean> | null => {
  const targetMap = getActiveMap(store);

  if (!targetMap?.nodes[nodeId]) {
    return null;
  }

  return updateMap(store, (map) => ({
    map: deleteNode(map, nodeId),
    value: true,
  }));
};

export const moveNodeInActiveMap = (
  store: WorkspaceStore,
  nodeId: string,
  newParentId: string,
): ActiveMapMutationResult<boolean> | null => {
  const targetMap = getActiveMap(store);

  if (!targetMap?.nodes[nodeId] || !targetMap.nodes[newParentId]) {
    return null;
  }

  return updateMap(store, (map) => ({
    map: moveNode(map, nodeId, newParentId),
    value: true,
  }));
};

export const setNodePositionInActiveMap = (
  store: WorkspaceStore,
  nodeId: string,
  position: NodePosition,
): ActiveMapMutationResult<boolean> | null => {
  const targetMap = getActiveMap(store);

  if (!targetMap?.nodes[nodeId]) {
    return null;
  }

  return updateMap(store, (map) => ({
    map: setNodePosition(map, nodeId, position),
    value: true,
  }));
};

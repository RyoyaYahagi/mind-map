import {
  addDetachedNode,
  addNode,
  createMindMap,
  deleteNode,
  editNode,
  fromJSON,
  moveNode,
  setNote,
  setNodePosition,
  toJSON,
  type MindMap,
  type NodePosition,
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

type PersistedWorkspaceStore = {
  version: 1;
  activeMapId: string | null;
  maps: Record<string, string>;
};

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
    const parsed = JSON.parse(raw) as Partial<PersistedWorkspaceStore>;

    if (parsed.version !== 1 || !parsed.maps || typeof parsed.maps !== "object") {
      return null;
    }

    const maps = Object.entries(parsed.maps).reduce<Record<string, MindMap>>((result, [mapId, serialized]) => {
      if (typeof serialized !== "string") {
        return result;
      }

      const map = fromJSON(serialized);

      result[mapId] = map;
      return result;
    }, {});

    return normalizeStore({
      activeMapId: typeof parsed.activeMapId === "string" ? parsed.activeMapId : null,
      maps,
    });
  } catch {
    return null;
  }
};

const persistStore = (storage: StorageLike, store: WorkspaceStore): void => {
  const payload: PersistedWorkspaceStore = {
    version: 1,
    activeMapId: store.activeMapId,
    maps: Object.fromEntries(
      Object.entries(store.maps).map(([mapId, map]) => [mapId, toJSON(map)]),
    ),
  };

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

const getTargetMap = (store: WorkspaceStore, mapId?: string): MindMap | null => {
  if (mapId) {
    return store.maps[mapId] ?? null;
  }

  return getActiveMap(store);
};

const findMapByNodeId = (store: WorkspaceStore, nodeId: string): MindMap | null =>
  Object.values(store.maps).find((map) => Boolean(map.nodes[nodeId])) ?? null;

const getTargetMapByNodeId = (
  store: WorkspaceStore,
  nodeId: string,
  mapId?: string,
): MindMap | null => {
  const preferredMap = getTargetMap(store, mapId);

  if (preferredMap?.nodes[nodeId]) {
    return preferredMap;
  }

  return findMapByNodeId(store, nodeId);
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
  mapId?: string,
): ActiveMapMutationResult<T> | null => {
  const currentMap = getTargetMap(store, mapId);

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
  mapId?: string,
): ActiveMapMutationResult<{ nodeId: string }> | null => {
  const targetMap = getTargetMapByNodeId(store, parentId, mapId);

  if (!targetMap) {
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
  }, targetMap.id);
};

export const addDetachedNodeToActiveMap = (
  store: WorkspaceStore,
  text: string,
  position?: NodePosition,
  mapId?: string,
): ActiveMapMutationResult<{ nodeId: string }> | null =>
  updateMap(store, (map) => {
    const result = addDetachedNode(map, text, position);

    return {
      map: result.map,
      value: {
        nodeId: result.node.id,
      },
    };
  }, mapId);

export const editNodeInActiveMap = (
  store: WorkspaceStore,
  nodeId: string,
  text: string,
  mapId?: string,
): ActiveMapMutationResult<boolean> | null => {
  const targetMap = getTargetMapByNodeId(store, nodeId, mapId);

  if (!targetMap) {
    return null;
  }

  return updateMap(store, (map) => ({
    map: editNode(map, nodeId, text),
    value: true,
  }), targetMap.id);
};

export const saveNodeNotesInActiveMap = (
  store: WorkspaceStore,
  nodeId: string,
  notes: string,
  mapId?: string,
): ActiveMapMutationResult<boolean> | null => {
  const targetMap = getTargetMapByNodeId(store, nodeId, mapId);

  if (!targetMap) {
    return null;
  }

  return updateMap(store, (map) => ({
    map: setNote(map, nodeId, notes),
    value: true,
  }), targetMap.id);
};

export const deleteNodeFromActiveMap = (
  store: WorkspaceStore,
  nodeId: string,
  mapId?: string,
): ActiveMapMutationResult<boolean> | null => {
  const targetMap = getTargetMapByNodeId(store, nodeId, mapId);

  if (!targetMap) {
    return null;
  }

  return updateMap(store, (map) => ({
    map: deleteNode(map, nodeId),
    value: true,
  }), targetMap.id);
};

export const moveNodeInActiveMap = (
  store: WorkspaceStore,
  nodeId: string,
  newParentId: string,
  mapId?: string,
): ActiveMapMutationResult<boolean> | null => {
  const targetMap = getTargetMapByNodeId(store, nodeId, mapId);

  if (!targetMap || !targetMap.nodes[newParentId]) {
    return null;
  }

  return updateMap(store, (map) => ({
    map: moveNode(map, nodeId, newParentId),
    value: true,
  }), targetMap.id);
};

export const setNodePositionInActiveMap = (
  store: WorkspaceStore,
  nodeId: string,
  position: NodePosition,
  mapId?: string,
): ActiveMapMutationResult<boolean> | null => {
  const targetMap = getTargetMapByNodeId(store, nodeId, mapId);

  if (!targetMap) {
    return null;
  }

  return updateMap(store, (map) => ({
    map: setNodePosition(map, nodeId, position),
    value: true,
  }), targetMap.id);
};

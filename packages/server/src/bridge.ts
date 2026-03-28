import {
  deserializeWorkspaceBridgePayload,
  serializeWorkspaceBridgePayload,
  type MindMap,
  type WorkspaceBridgePayload,
} from "@mindmap/core";

const getFallbackActiveMapId = (maps: Record<string, MindMap>): string | null =>
  Object.values(maps).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.id ?? null;

export const buildBridgePayload = (
  maps: Record<string, MindMap>,
  activeMapId: string | null,
): WorkspaceBridgePayload =>
  serializeWorkspaceBridgePayload({
    activeMapId:
      activeMapId && maps[activeMapId]
        ? activeMapId
        : getFallbackActiveMapId(maps),
    maps,
  });

export const mergeImportedBridgePayload = (
  currentMaps: Record<string, MindMap>,
  currentActiveMapId: string | null,
  payload: unknown,
): {
  activeMapId: string | null;
  importedMapCount: number;
  maps: Record<string, MindMap>;
} => {
  const imported = deserializeWorkspaceBridgePayload(payload);
  const maps = {
    ...currentMaps,
    ...imported.maps,
  };
  const activeMapCandidate = imported.activeMapId ?? currentActiveMapId;

  return {
    activeMapId:
      activeMapCandidate && maps[activeMapCandidate]
        ? activeMapCandidate
        : getFallbackActiveMapId(maps),
    importedMapCount: Object.keys(imported.maps).length,
    maps,
  };
};

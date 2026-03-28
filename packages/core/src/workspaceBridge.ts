import { fromJSON, toJSON } from "./serializer.js";
import type { MindMap } from "./types.js";

export type WorkspaceBridgePayload = {
  version: 1;
  activeMapId: string | null;
  maps: Record<string, string>;
};

type WorkspaceBridgeState = {
  activeMapId: string | null;
  maps: Record<string, MindMap>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const serializeWorkspaceBridgePayload = (
  store: WorkspaceBridgeState,
): WorkspaceBridgePayload => ({
  version: 1,
  activeMapId: store.activeMapId,
  maps: Object.fromEntries(
    Object.entries(store.maps).map(([mapId, map]) => [mapId, toJSON(map)]),
  ),
});

export const deserializeWorkspaceBridgePayload = (
  value: unknown,
): WorkspaceBridgeState => {
  if (!isRecord(value)) {
    throw new Error("Invalid workspace bridge payload: root value must be an object");
  }

  if (value.version !== 1) {
    throw new Error("Invalid workspace bridge payload: version must be 1");
  }

  if (value.activeMapId !== null && value.activeMapId !== undefined && typeof value.activeMapId !== "string") {
    throw new Error("Invalid workspace bridge payload: activeMapId must be a string or null");
  }

  if (!isRecord(value.maps)) {
    throw new Error("Invalid workspace bridge payload: maps must be an object");
  }

  const maps = Object.entries(value.maps).reduce<Record<string, MindMap>>((result, [mapId, serialized]) => {
    if (typeof serialized !== "string") {
      throw new Error(`Invalid workspace bridge payload: map ${mapId} must be a string`);
    }

    result[mapId] = fromJSON(serialized);
    return result;
  }, {});

  return {
    activeMapId: typeof value.activeMapId === "string" ? value.activeMapId : null,
    maps,
  };
};

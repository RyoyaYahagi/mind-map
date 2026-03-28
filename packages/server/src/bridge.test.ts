import { createMindMap } from "@mindmap/core";
import { describe, expect, it } from "vitest";

import { buildBridgePayload, mergeImportedBridgePayload } from "./bridge.js";

describe("server bridge helpers", () => {
  it("builds a bridge payload with a fallback active map", () => {
    const map = createMindMap("Root");
    const payload = buildBridgePayload({ [map.id]: map }, "missing-map-id");

    expect(payload.version).toBe(1);
    expect(payload.activeMapId).toBe(map.id);
    expect(Object.keys(payload.maps)).toEqual([map.id]);
  });

  it("merges imported payloads and prefers the imported active map", () => {
    const current = createMindMap("Current");
    const imported = createMindMap("Imported");
    const payload = buildBridgePayload({ [imported.id]: imported }, imported.id);

    const merged = mergeImportedBridgePayload({ [current.id]: current }, current.id, payload);

    expect(Object.keys(merged.maps)).toHaveLength(2);
    expect(merged.activeMapId).toBe(imported.id);
    expect(merged.importedMapCount).toBe(1);
  });
});

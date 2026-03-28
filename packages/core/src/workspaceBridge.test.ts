import { createMindMap } from "./tree.js";
import { describe, expect, it } from "vitest";

import {
  deserializeWorkspaceBridgePayload,
  serializeWorkspaceBridgePayload,
} from "./workspaceBridge.js";

describe("workspace bridge payload", () => {
  it("round-trips maps through the bridge payload", () => {
    const map = createMindMap("Root");
    const payload = serializeWorkspaceBridgePayload({
      activeMapId: map.id,
      maps: {
        [map.id]: map,
      },
    });
    const restored = deserializeWorkspaceBridgePayload(payload);

    expect(payload.version).toBe(1);
    expect(restored.activeMapId).toBe(map.id);
    expect(restored.maps[map.id]?.title).toBe("Root");
  });

  it("rejects invalid map payloads", () => {
    expect(() =>
      deserializeWorkspaceBridgePayload({
        version: 1,
        activeMapId: null,
        maps: {
          broken: 42,
        },
      }),
    ).toThrow("Invalid workspace bridge payload: map broken must be a string");
  });
});

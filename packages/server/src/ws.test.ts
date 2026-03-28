import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import { addClient, broadcast, clients, removeClient } from "./ws.js";

const createClient = () =>
  ({
    readyState: WebSocket.OPEN,
    send: vi.fn(),
  }) as unknown as WebSocket;

describe("ws broadcast", () => {
  afterEach(() => {
    clients.clear();
  });

  it("sends map updates only to clients viewing the same map", () => {
    const first = createClient();
    const second = createClient();

    addClient(first, () => "map-a");
    addClient(second, () => "map-b");

    broadcast({ type: "map:update", payload: { id: "map-a" } }, "map-a");

    expect(first.send).toHaveBeenCalledTimes(1);
    expect(second.send).not.toHaveBeenCalled();
  });

  it("continues to support broadcasts without a map filter", () => {
    const first = createClient();
    const second = createClient();

    addClient(first, () => "map-a");
    addClient(second, () => "map-b");

    broadcast({ type: "ping" });

    expect(first.send).toHaveBeenCalledTimes(1);
    expect(second.send).toHaveBeenCalledTimes(1);
  });

  it("removes clients that fail during send", () => {
    const failing = ({
      readyState: WebSocket.OPEN,
      send: vi.fn(() => {
        throw new Error("broken");
      }),
    }) as unknown as WebSocket;

    addClient(failing, () => "map-a");

    broadcast({ type: "map:update", payload: { id: "map-a" } }, "map-a");

    expect(clients.has(failing)).toBe(false);
    removeClient(failing);
  });
});

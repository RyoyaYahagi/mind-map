import { describe, expect, it } from "vitest";

import { fromJSON, toJSON } from "./serializer.js";
import { addDetachedNode, addNode, createMindMap, deleteNode, moveNode, setNodePosition } from "./tree.js";

describe("tree position support", () => {
  it("creates root nodes with a default position", () => {
    const map = createMindMap("Root");

    expect(map.nodes[map.rootId]?.position).toEqual({ x: 0, y: 0 });
  });

  it("stores explicit positions when adding nodes", () => {
    const map = createMindMap("Root");
    const result = addNode(map, map.rootId, "Child", { x: 320, y: 180 });

    expect(result.node.position).toEqual({ x: 320, y: 180 });
    expect(result.map.nodes[result.node.id]?.position).toEqual({ x: 320, y: 180 });
  });

  it("updates only the target node position", () => {
    const map = createMindMap("Root");
    const first = addNode(map, map.rootId, "First", { x: 240, y: 60 });
    const second = addNode(first.map, map.rootId, "Second", { x: 240, y: 180 });

    const updated = setNodePosition(second.map, first.node.id, { x: 500, y: 260 });

    expect(updated.nodes[first.node.id]?.position).toEqual({ x: 500, y: 260 });
    expect(updated.nodes[first.node.id]?.parent).toBe(map.rootId);
    expect(updated.nodes[map.rootId]?.children).toEqual([first.node.id, second.node.id]);
    expect(updated.nodes[second.node.id]?.position).toEqual({ x: 240, y: 180 });
  });

  it("creates detached top-level nodes with no parent", () => {
    const map = createMindMap("Root");
    const result = addDetachedNode(map, "Detached", { x: 640, y: 320 });

    expect(result.node.parent).toBeNull();
    expect(result.map.nodes[result.node.id]?.position).toEqual({ x: 640, y: 320 });
  });

  it("deletes detached top-level nodes without touching the root", () => {
    const map = createMindMap("Root");
    const detached = addDetachedNode(map, "Detached", { x: 640, y: 320 });
    const updated = deleteNode(detached.map, detached.node.id);

    expect(updated.nodes[detached.node.id]).toBeUndefined();
    expect(updated.nodes[updated.rootId]?.text).toBe("Root");
  });

  it("moves detached top-level nodes under another parent", () => {
    const map = createMindMap("Root");
    const first = addNode(map, map.rootId, "Parent", { x: 240, y: 60 });
    const detached = addDetachedNode(first.map, "Detached", { x: 640, y: 320 });
    const updated = moveNode(detached.map, detached.node.id, first.node.id);

    expect(updated.nodes[detached.node.id]?.parent).toBe(first.node.id);
    expect(updated.nodes[first.node.id]?.children).toContain(detached.node.id);
  });
});

describe("serializer position compatibility", () => {
  it("accepts legacy JSON without position", () => {
    const legacy = JSON.stringify({
      version: 1,
      id: "map-1",
      title: "Legacy",
      rootId: "root",
      nodes: {
        root: {
          id: "root",
          text: "Legacy",
          children: ["child"],
          parent: null,
          createdAt: "2026-03-26T00:00:00.000Z",
          updatedAt: "2026-03-26T00:00:00.000Z",
        },
        child: {
          id: "child",
          text: "Child",
          children: [],
          parent: "root",
          createdAt: "2026-03-26T00:00:00.000Z",
          updatedAt: "2026-03-26T00:00:00.000Z",
        },
      },
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z",
    });

    const map = fromJSON(legacy);

    expect(map.nodes.root?.position).toBeUndefined();
    expect(map.nodes.child?.position).toBeUndefined();
  });

  it("round-trips JSON with position", () => {
    const map = createMindMap("Root");
    const child = addNode(map, map.rootId, "Child", { x: 260, y: 140 }).map;
    const moved = setNodePosition(child, child.rootId, { x: 40, y: 20 });

    const restored = fromJSON(toJSON(moved));

    expect(restored.nodes[restored.rootId]?.position).toEqual({ x: 40, y: 20 });
    expect(
      restored.nodes[restored.nodes[restored.rootId]?.children[0] ?? ""]?.position,
    ).toEqual({ x: 260, y: 140 });
  });
});

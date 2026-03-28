import { Command } from "commander";
import { addNode, createMindMap } from "@mindmap/core";
import type { MindMap } from "@mindmap/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  const loadActiveMapMock = vi.fn();
  const saveMapMock = vi.fn();
  const printJsonMock = vi.fn();
  const printTextMock = vi.fn();

  class MockCliError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = "CliError";
      this.code = code;
    }
  }

  return {
    CliError: MockCliError,
    loadActiveMapMock,
    printJsonMock,
    printTextMock,
    saveMapMock,
  };
});

vi.mock("../storage.js", () => ({
  CliError: mocked.CliError,
  loadActiveMap: mocked.loadActiveMapMock,
  saveMap: mocked.saveMapMock,
}));

vi.mock("../output.js", () => ({
  mapToNodePayload: (node: {
    children: string[];
    createdAt: string;
    id: string;
    notes?: string;
    parent: string | null;
    position?: { x: number; y: number };
    text: string;
    updatedAt: string;
  }) => ({
    childIds: node.children,
    createdAt: node.createdAt,
    id: node.id,
    notes: node.notes ?? null,
    parentId: node.parent,
    position: node.position ?? null,
    text: node.text,
    updatedAt: node.updatedAt,
  }),
  printJson: mocked.printJsonMock,
  printText: mocked.printTextMock,
}));

import { registerNodeCommand } from "./node.js";

const createProgram = (): Command => {
  const program = new Command();
  program.option("--json", "JSON で出力する", false);
  program.exitOverride();
  registerNodeCommand(program);
  return program;
};

const runNodeCommand = async (args: string[]): Promise<void> => {
  const program = createProgram();
  await program.parseAsync(args, { from: "user" });
};

describe("registerNodeCommand", () => {
  beforeEach(() => {
    mocked.loadActiveMapMock.mockReset();
    mocked.saveMapMock.mockReset();
    mocked.printJsonMock.mockReset();
    mocked.printTextMock.mockReset();
  });

  it("adds detached nodes with an explicit position", async () => {
    const map = createMindMap("Root");
    mocked.loadActiveMapMock.mockResolvedValue(map);

    await runNodeCommand(["node", "add", "--detached", "Detached", "--x", "640", "--y", "320"]);

    expect(mocked.saveMapMock).toHaveBeenCalledTimes(1);
    const savedMap = mocked.saveMapMock.mock.calls[0]?.[0] as MindMap | undefined;
    const detachedNode = savedMap
      ? Object.values(savedMap.nodes).find((node) => node.text === "Detached")
      : null;

    expect(detachedNode).toMatchObject({
      parent: null,
      position: { x: 640, y: 320 },
      text: "Detached",
    });
    expect(mocked.printTextMock).toHaveBeenCalledWith(expect.stringMatching(/^added .+ -> detached$/u));
  });

  it("adds child nodes with an explicit position", async () => {
    const map = createMindMap("Root");
    mocked.loadActiveMapMock.mockResolvedValue(map);

    await runNodeCommand(["node", "add", "--root", "Child", "--x", "180", "--y", "96"]);

    expect(mocked.saveMapMock).toHaveBeenCalledTimes(1);
    const savedMap = mocked.saveMapMock.mock.calls[0]?.[0] as MindMap | undefined;
    const childNode = savedMap
      ? Object.values(savedMap.nodes).find((node) => node.text === "Child")
      : null;

    expect(childNode).toMatchObject({
      parent: map.rootId,
      position: { x: 180, y: 96 },
      text: "Child",
    });
  });

  it("updates node positions", async () => {
    const map = createMindMap("Root");
    const withChild = addNode(map, map.rootId, "Child", { x: 200, y: 120 });
    mocked.loadActiveMapMock.mockResolvedValue(withChild.map);

    await runNodeCommand(["node", "position", withChild.node.id, "480", "260"]);

    expect(mocked.saveMapMock).toHaveBeenCalledTimes(1);
    const savedMap = mocked.saveMapMock.mock.calls[0]?.[0] as MindMap | undefined;

    expect(savedMap?.nodes[withChild.node.id]).toMatchObject({
      position: { x: 480, y: 260 },
      text: "Child",
    });
    expect(mocked.printTextMock).toHaveBeenCalledWith(`positioned ${withChild.node.id} -> (480, 260)`);
  });

  it("rejects root and detached flags together", async () => {
    const map = createMindMap("Root");
    mocked.loadActiveMapMock.mockResolvedValue(map);

    await expect(
      runNodeCommand(["node", "add", "--root", "--detached", "Invalid"]),
    ).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
      message: "--root と --detached は同時に指定できません",
    });

    expect(mocked.saveMapMock).not.toHaveBeenCalled();
  });

  it("rejects incomplete coordinate input", async () => {
    const map = createMindMap("Root");
    mocked.loadActiveMapMock.mockResolvedValue(map);

    await expect(
      runNodeCommand(["node", "add", "--root", "Invalid", "--x", "10"]),
    ).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
      message: "--x と --y はセットで指定してください",
    });

    expect(mocked.saveMapMock).not.toHaveBeenCalled();
  });
});

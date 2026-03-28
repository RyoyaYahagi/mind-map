import {
  addDetachedNode,
  addNode,
  deleteNode,
  editNode,
  getAncestors,
  getNode,
  moveNode,
  setNodePosition,
  setNote,
  resolveNodeId,
} from "@mindmap/core";
import type { MindMap, NodePosition } from "@mindmap/core";
import type { Command } from "commander";

import { mapToNodePayload, printJson, printText } from "../output.js";
import { CliError, loadActiveMap, saveMap } from "../storage.js";

const requireResolvedNodeId = (map: MindMap, input: string): string => {
  const exact = getNode(map, input);

  if (exact) {
    return exact.id;
  }

  const resolved = resolveNodeId(map, input);

  if (resolved) {
    return resolved;
  }

  const ambiguous = Object.keys(map.nodes).filter((nodeId) => nodeId.startsWith(input));

  if (ambiguous.length > 1) {
    throw new CliError("NODE_ID_AMBIGUOUS", `複数のノードIDが ${input} に一致しました`);
  }

  throw new CliError("NODE_NOT_FOUND", `ノードが見つかりません: ${input}`);
};

const parsePositionOption = (options: { x?: string; y?: string }): NodePosition | undefined => {
  const hasX = options.x !== undefined;
  const hasY = options.y !== undefined;

  if (hasX !== hasY) {
    throw new CliError("INVALID_ARGUMENT", "--x と --y はセットで指定してください");
  }

  if (!hasX || !hasY) {
    return undefined;
  }

  const xValue = options.x;
  const yValue = options.y;

  if (xValue === undefined || yValue === undefined) {
    return undefined;
  }

  const x = Number.parseFloat(xValue);
  const y = Number.parseFloat(yValue);

  if (Number.isNaN(x) || Number.isNaN(y)) {
    throw new CliError("INVALID_ARGUMENT", "--x と --y には数値を指定してください");
  }

  return { x, y };
};

export const registerNodeCommand = (program: Command): void => {
  const node = program.command("node").description("ノード操作");

  node
    .command("add")
    .argument("<args...>", "parentId text (--root/--detached時はtextのみ)")
    .option("--root", "ルートノード直下に追加する")
    .option("--detached", "親を持たないトップレベルノードとして追加する")
    .option("--x <x>", "ノードのX座標")
    .option("--y <y>", "ノードのY座標")
    .description("ノードを追加する")
    .action(
      async (
        args: string[],
        options: { detached?: boolean; root?: boolean; x?: string; y?: string },
        command: Command,
      ) => {
      const json = command.optsWithGlobals().json === true;
      const map = await loadActiveMap();
      const position = parsePositionOption(options);

      if (options.root && options.detached) {
        throw new CliError("INVALID_ARGUMENT", "--root と --detached は同時に指定できません");
      }

      let resolvedParentId: string;
      let text: string;

      if (options.detached) {
        if (args.length < 1) {
          throw new CliError("INVALID_ARGUMENT", "テキストを指定してください");
        }

        text = args.join(" ");
        const result = addDetachedNode(map, text, position);

        await saveMap(result.map);

        const payload = {
          ok: true,
          mapId: result.map.id,
          nodeId: result.node.id,
          parentId: null,
          node: mapToNodePayload(result.node),
        };

        if (json) {
          printJson(payload);
          return;
        }

        printText(`added ${result.node.id} -> detached`);
        return;
      }

      if (options.root) {
        if (args.length < 1) {
          throw new CliError("INVALID_ARGUMENT", "テキストを指定してください");
        }
        resolvedParentId = map.rootId;
        text = args.join(" ");
      } else {
        if (args.length < 2) {
          throw new CliError("INVALID_ARGUMENT", "parentId と text を指定してください。例: mm node add <parentId> \"text\" または mm node add --root \"text\"");
        }
        resolvedParentId = requireResolvedNodeId(map, args[0]);
        text = args.slice(1).join(" ");
      }
      const result = addNode(map, resolvedParentId, text, position);

      await saveMap(result.map);

      const payload = {
        ok: true,
        mapId: result.map.id,
        nodeId: result.node.id,
        parentId: resolvedParentId,
        node: mapToNodePayload(result.node),
      };

      if (json) {
        printJson(payload);
        return;
      }

      printText(`added ${result.node.id} -> ${resolvedParentId}`);
    });

  node
    .command("edit")
    .argument("<id>", "ノードID")
    .argument("<text>", "新しい本文")
    .description("ノード本文を更新する")
    .action(async (id: string, text: string, _options: unknown, command: Command) => {
      const json = command.optsWithGlobals().json === true;
      const map = await loadActiveMap();
      const nodeId = requireResolvedNodeId(map, id);
      const updated = editNode(map, nodeId, text);
      const node = getNode(updated, nodeId);

      if (!node) {
        throw new CliError("NODE_NOT_FOUND", `ノードが見つかりません: ${id}`);
      }

      await saveMap(updated);

      const payload = {
        ok: true,
        mapId: updated.id,
        nodeId,
        node: mapToNodePayload(node),
      };

      if (json) {
        printJson(payload);
        return;
      }

      printText(`edited ${nodeId}`);
    });

  node
    .command("note")
    .argument("<id>", "ノードID")
    .argument("<notes>", "ノート本文")
    .description("ノードノートを設定する")
    .action(async (id: string, notes: string, _options: unknown, command: Command) => {
      const json = command.optsWithGlobals().json === true;
      const map = await loadActiveMap();
      const nodeId = requireResolvedNodeId(map, id);
      const updated = setNote(map, nodeId, notes);
      const node = getNode(updated, nodeId);

      if (!node) {
        throw new CliError("NODE_NOT_FOUND", `ノードが見つかりません: ${id}`);
      }

      await saveMap(updated);

      const payload = {
        ok: true,
        mapId: updated.id,
        nodeId,
        node: mapToNodePayload(node),
      };

      if (json) {
        printJson(payload);
        return;
      }

      printText(`updated note ${nodeId}`);
    });

  node
    .command("delete")
    .argument("<id>", "ノードID")
    .description("ノードを削除する")
    .action(async (id: string, _options: unknown, command: Command) => {
      const json = command.optsWithGlobals().json === true;
      const map = await loadActiveMap();
      const nodeId = requireResolvedNodeId(map, id);
      const node = getNode(map, nodeId);

      if (!node) {
        throw new CliError("NODE_NOT_FOUND", `ノードが見つかりません: ${id}`);
      }

      const deletedNode = mapToNodePayload(node);
      const updated = deleteNode(map, nodeId);
      await saveMap(updated);

      const payload = {
        ok: true,
        mapId: updated.id,
        nodeId,
        deleted: deletedNode,
      };

      if (json) {
        printJson(payload);
        return;
      }

      printText(`deleted ${nodeId}`);
    });

  node
    .command("move")
    .argument("<id>", "ノードID")
    .argument("<parentId>", "移動先親ノードID")
    .description("ノードを移動する")
    .action(async (id: string, parentId: string, _options: unknown, command: Command) => {
      const json = command.optsWithGlobals().json === true;
      const map = await loadActiveMap();
      const nodeId = requireResolvedNodeId(map, id);
      const nextParentId = requireResolvedNodeId(map, parentId);
      const updated = moveNode(map, nodeId, nextParentId);
      const node = getNode(updated, nodeId);

      if (!node) {
        throw new CliError("NODE_NOT_FOUND", `ノードが見つかりません: ${id}`);
      }

      await saveMap(updated);

      const payload = {
        ok: true,
        mapId: updated.id,
        nodeId,
        parentId: nextParentId,
        node: mapToNodePayload(node),
      };

      if (json) {
        printJson(payload);
        return;
      }

      printText(`moved ${nodeId} -> ${nextParentId}`);
    });

  node
    .command("position")
    .argument("<id>", "ノードID")
    .argument("<x>", "X座標")
    .argument("<y>", "Y座標")
    .description("ノード座標を更新する")
    .action(async (id: string, x: string, y: string, _options: unknown, command: Command) => {
      const json = command.optsWithGlobals().json === true;
      const map = await loadActiveMap();
      const nodeId = requireResolvedNodeId(map, id);
      const nextX = Number.parseFloat(x);
      const nextY = Number.parseFloat(y);

      if (Number.isNaN(nextX) || Number.isNaN(nextY)) {
        throw new CliError("INVALID_ARGUMENT", "x と y には数値を指定してください");
      }

      const updated = setNodePosition(map, nodeId, { x: nextX, y: nextY });
      const node = getNode(updated, nodeId);

      if (!node) {
        throw new CliError("NODE_NOT_FOUND", `ノードが見つかりません: ${id}`);
      }

      await saveMap(updated);

      const payload = {
        ok: true,
        mapId: updated.id,
        nodeId,
        node: mapToNodePayload(node),
      };

      if (json) {
        printJson(payload);
        return;
      }

      printText(`positioned ${nodeId} -> (${nextX}, ${nextY})`);
    });

  node
    .command("get")
    .argument("<id>", "ノードID")
    .description("ノード詳細を表示する")
    .action(async (id: string, _options: unknown, command: Command) => {
      const json = command.optsWithGlobals().json === true;
      const map = await loadActiveMap();
      const nodeId = requireResolvedNodeId(map, id);
      const node = getNode(map, nodeId);

      if (!node) {
        throw new CliError("NODE_NOT_FOUND", `ノードが見つかりません: ${id}`);
      }

      const payload = {
        ok: true,
        mapId: map.id,
        nodeId,
        node: mapToNodePayload(node),
        ancestorIds: getAncestors(map, nodeId).map((ancestor) => ancestor.id),
      };

      if (json) {
        printJson(payload);
        return;
      }

      printText(`id ${node.id}`);
      printText(`text ${node.text}`);
      printText(`parent ${node.parent ?? "null"}`);
      printText(`children ${node.children.join(", ") || "-"}`);
      if (node.notes) {
        printText(`notes\n${node.notes}`);
      }
    });
};

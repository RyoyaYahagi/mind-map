import {
  addNode,
  deleteNode,
  editNode,
  getAncestors,
  getNode,
  moveNode,
  setNote,
  resolveNodeId,
} from "@mindmap/core";
import type { MindMap } from "@mindmap/core";
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

export const registerNodeCommand = (program: Command): void => {
  const node = program.command("node").description("ノード操作");

  node
    .command("add")
    .argument("<args...>", "parentId text (--root時はtextのみ)")
    .option("--root", "ルートノード直下に追加する")
    .description("ノードを追加する")
    .action(async (args: string[], options: { root?: boolean }, command: Command) => {
      const json = command.optsWithGlobals().json === true;
      const map = await loadActiveMap();

      let resolvedParentId: string;
      let text: string;

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
      const result = addNode(map, resolvedParentId, text);

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

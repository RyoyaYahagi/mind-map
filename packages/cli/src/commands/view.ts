import { getNode, getSubtree, resolveNodeId } from "@mindmap/core";
import type { Command } from "commander";

import { mapToNodePayload, printJson, printText, renderTree } from "../output.js";
import { CliError, loadActiveMap } from "../storage.js";

export const registerViewCommand = (program: Command): void => {
  program
    .command("view")
    .argument("[id]", "開始ノードID")
    .option("--depth <n>", "表示深さ", (value) => Number.parseInt(value, 10))
    .description("ツリー表示を行う")
    .action(async (id: string | undefined, options: { depth?: number }, command: Command) => {
      const json = command.optsWithGlobals().json === true;
      const map = await loadActiveMap();
      const nodeId = id ? resolveNodeId(map, id) ?? (getNode(map, id) ? id : null) : map.rootId;

      if (!nodeId) {
        const ambiguous = id ? Object.keys(map.nodes).filter((candidate) => candidate.startsWith(id)) : [];

        if (ambiguous.length > 1) {
          throw new CliError("NODE_ID_AMBIGUOUS", `複数のノードIDが ${id} に一致しました`);
        }

        throw new CliError("NODE_NOT_FOUND", `ノードが見つかりません: ${id}`);
      }

      const root = getNode(map, nodeId);

      if (!root) {
        throw new CliError("NODE_NOT_FOUND", `ノードが見つかりません: ${nodeId}`);
      }

      if (options.depth !== undefined && (!Number.isInteger(options.depth) || options.depth < 0)) {
        throw new CliError("INVALID_ARGUMENT", "--depth には 0 以上の整数を指定してください");
      }

      const payload = {
        ok: true,
        mapId: map.id,
        rootNodeId: nodeId,
        depth: options.depth ?? null,
        nodeCount: getSubtree(map, nodeId).length,
        tree: renderTree(map, nodeId, options.depth),
        root: mapToNodePayload(root),
      };

      if (json) {
        printJson(payload);
        return;
      }

      printText(payload.tree);
    });
};

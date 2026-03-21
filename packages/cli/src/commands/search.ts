import { searchNodes } from "@mindmap/core";
import type { Command } from "commander";

import { mapToNodePayload, printJson, printText } from "../output.js";
import { loadActiveMap } from "../storage.js";

export const registerSearchCommand = (program: Command): void => {
  program
    .command("search")
    .argument("<query>", "検索文字列")
    .description("ノードを検索する")
    .action(async (query: string, _options: unknown, command: Command) => {
      const json = command.optsWithGlobals().json === true;
      const map = await loadActiveMap();
      const nodes = searchNodes(map, query);

      const payload = {
        ok: true,
        mapId: map.id,
        query,
        count: nodes.length,
        nodes: nodes.map(mapToNodePayload),
      };

      if (json) {
        printJson(payload);
        return;
      }

      if (nodes.length === 0) {
        printText("一致するノードはありません");
        return;
      }

      printText(
        nodes
          .map((node) => `${node.id} ${node.text}${node.parent ? ` parent=${node.parent}` : ""}`)
          .join("\n"),
      );
    });
};

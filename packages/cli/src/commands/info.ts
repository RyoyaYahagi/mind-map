import { getMapInfo } from "@mindmap/core";
import type { Command } from "commander";

import { printJson, printText } from "../output.js";
import { getConfigPath, loadActiveMap, loadConfig } from "../storage.js";

export const registerInfoCommand = (program: Command): void => {
  program
    .command("info")
    .description("アクティブマップの情報を表示する")
    .action(async (_options: unknown, command: Command) => {
      const json = command.optsWithGlobals().json === true;
      const config = await loadConfig();
      const map = await loadActiveMap();
      const info = getMapInfo(map);

      const payload = {
        ok: true,
        mapId: map.id,
        activeMapId: config.activeMapId,
        title: info.title,
        rootNodeId: map.rootId,
        nodeCount: info.nodeCount,
        maxDepth: info.maxDepth,
        createdAt: map.createdAt,
        updatedAt: map.updatedAt,
        configPath: getConfigPath(),
      };

      if (json) {
        printJson(payload);
        return;
      }

      printText(`title ${payload.title}`);
      printText(`map ${payload.mapId}`);
      printText(`root ${payload.rootNodeId}`);
      printText(`nodes ${payload.nodeCount}`);
      printText(`depth ${payload.maxDepth}`);
    });
};

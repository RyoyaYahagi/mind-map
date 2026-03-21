import type { Command } from "commander";

import { printJson, printMapList } from "../output.js";
import { listMaps } from "../storage.js";

export const registerListCommand = (program: Command): void => {
  program
    .command("list")
    .description("保存済みマップ一覧を表示する")
    .action(async (_options: unknown, command: Command) => {
      const json = command.optsWithGlobals().json === true;
      const maps = await listMaps();

      if (json) {
        printJson({
          ok: true,
          maps: maps.map((map) => ({
            id: map.id,
            title: map.title,
            filePath: map.filePath,
            createdAt: map.createdAt,
            updatedAt: map.updatedAt,
            nodeCount: map.nodeCount,
            isActive: map.isActive,
          })),
        });
        return;
      }

      printMapList(maps);
    });
};

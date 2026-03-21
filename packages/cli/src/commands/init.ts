import { createMindMap } from "@mindmap/core";
import type { Command } from "commander";

import { printJson, printText } from "../output.js";
import { saveMap, setActiveMapId } from "../storage.js";

export const registerInitCommand = (program: Command): void => {
  program
    .command("init")
    .argument("[name]", "マップ名")
    .description("新しいマインドマップを作成してアクティブにする")
    .action(async (name: string | undefined, _options: unknown, command: Command) => {
      const json = command.optsWithGlobals().json === true;
      const title = name?.trim() || "Untitled";
      const map = createMindMap(title);
      const filePath = await saveMap(map);

      await setActiveMapId(map.id);

      const payload = {
        ok: true,
        mapId: map.id,
        activeMapId: map.id,
        title: map.title,
        rootNodeId: map.rootId,
        filePath,
      };

      if (json) {
        printJson(payload);
        return;
      }

      printText(`created ${map.title} [${map.id}]`);
      printText(`active ${map.id}`);
      printText(`root ${map.rootId}`);
    });
};

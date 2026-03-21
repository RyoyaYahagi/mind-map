import type { Command } from "commander";

import { printJson, printText } from "../output.js";
import { loadMapById, resolveStoredMapId, setActiveMapId } from "../storage.js";

export const registerOpenCommand = (program: Command): void => {
  program
    .command("open")
    .argument("<name>", "マップ名またはID")
    .description("既存マップをアクティブにする")
    .action(async (name: string, _options: unknown, command: Command) => {
      const json = command.optsWithGlobals().json === true;
      const mapId = await resolveStoredMapId(name);
      const map = await loadMapById(mapId);

      await setActiveMapId(map.id);

      const payload = {
        ok: true,
        mapId: map.id,
        activeMapId: map.id,
        title: map.title,
        rootNodeId: map.rootId,
      };

      if (json) {
        printJson(payload);
        return;
      }

      printText(`active ${map.title} [${map.id}]`);
      printText(`root ${map.rootId}`);
    });
};

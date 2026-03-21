import { toJSON, toMarkdown } from "@mindmap/core";
import type { Command } from "commander";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { CliError, loadActiveMap } from "../storage.js";
import { printJson, printText } from "../output.js";

export const registerExportCommand = (program: Command): void => {
  program
    .command("export")
    .argument("<format>", "json または markdown")
    .argument("[file]", "出力先ファイル")
    .description("アクティブマップをエクスポートする")
    .action(
      async (format: string, file: string | undefined, _options: unknown, command: Command) => {
        const json = command.optsWithGlobals().json === true;
        const map = await loadActiveMap();
        const normalizedFormat = format.toLowerCase();
        const content =
          normalizedFormat === "json"
            ? toJSON(map)
            : normalizedFormat === "markdown"
              ? toMarkdown(map)
              : null;

        if (!content) {
          throw new CliError("INVALID_ARGUMENT", "format は json または markdown を指定してください");
        }

        if (file) {
          const filePath = resolve(process.cwd(), file);
          await writeFile(filePath, `${content}\n`, "utf8");

          const payload = {
            ok: true,
            mapId: map.id,
            format: normalizedFormat,
            filePath,
          };

          if (json) {
            printJson(payload);
            return;
          }

          printText(`exported ${normalizedFormat} -> ${filePath}`);
          return;
        }

        if (json) {
          printJson({
            ok: true,
            mapId: map.id,
            format: normalizedFormat,
            content,
          });
          return;
        }

        printText(content);
      },
    );
};

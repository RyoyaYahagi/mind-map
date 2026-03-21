#!/usr/bin/env node

import { Command } from "commander";

import { registerExportCommand } from "../src/commands/export.js";
import { registerInfoCommand } from "../src/commands/info.js";
import { registerInitCommand } from "../src/commands/init.js";
import { registerListCommand } from "../src/commands/list.js";
import { registerNodeCommand } from "../src/commands/node.js";
import { registerOpenCommand } from "../src/commands/open.js";
import { registerSearchCommand } from "../src/commands/search.js";
import { registerViewCommand } from "../src/commands/view.js";
import { handleCommandError } from "../src/output.js";
import { CliError } from "../src/storage.js";

const program = new Command();

program
  .name("mm")
  .description("Mind Map CLI")
  .option("--json", "JSON で出力する", false)
  .showHelpAfterError();

program.exitOverride((error) => {
  if (error.code === "commander.helpDisplayed") {
    process.exit(0);
  }

  throw new CliError("INVALID_ARGUMENT", error.message.trim());
});

registerInitCommand(program);
registerListCommand(program);
registerOpenCommand(program);
registerInfoCommand(program);
registerNodeCommand(program);
registerViewCommand(program);
registerSearchCommand(program);
registerExportCommand(program);

const main = async (): Promise<void> => {
  await program.parseAsync(process.argv);
};

main().catch((error) => {
  handleCommandError(error, {
    json: process.argv.includes("--json"),
  });
  process.exit(1);
});

import type { Command } from "commander";

import { printText } from "../output.js";

export const registerServeCommand = (program: Command): void => {
  program
    .command("serve")
    .option("-p, --port <port>", "サーバーポート番号", "3000")
    .description("Web UIサーバーを起動する")
    .action(async (options: { port: string }) => {
      const port = parseInt(options.port, 10);

      if (isNaN(port) || port < 1 || port > 65535) {
        printText(`Invalid port: ${options.port}`);
        process.exit(1);
      }

      printText(`Starting mind map server on port ${port}...`);
      printText(`Open http://localhost:${port} in your browser`);

      const { startServer } = await import("@mindmap/server");
      await startServer(port);
    });
};

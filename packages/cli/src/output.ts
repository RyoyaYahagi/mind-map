import chalk from "chalk";

import type { MindMap, MindMapNode } from "@mindmap/core";

import { CliError } from "./storage.js";

export interface OutputContext {
  json: boolean;
}

export const isJsonOutputEnabled = (value: unknown): boolean => value === true;

export const printJson = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

export const printText = (value: string): void => {
  process.stdout.write(value.endsWith("\n") ? value : `${value}\n`);
};

export const makeErrorPayload = (error: unknown): { error: true; code: string; message: string } => {
  if (error instanceof CliError) {
    return {
      error: true,
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      error: true,
      code: "INTERNAL_ERROR",
      message: error.message,
    };
  }

  return {
    error: true,
    code: "INTERNAL_ERROR",
    message: "不明なエラーが発生しました",
  };
};

export const handleCommandError = (error: unknown, context: OutputContext): void => {
  const payload = makeErrorPayload(error);

  if (context.json) {
    printJson(payload);
  } else {
    printText(chalk.red(`Error [${payload.code}] ${payload.message}`));
  }

  process.exitCode = 1;
};

const formatNodeLabel = (node: MindMapNode): string => {
  const id = chalk.gray(`[${node.id}]`);
  return `${chalk.cyan(node.text)} ${id}`;
};

const renderTreeLines = (
  map: MindMap,
  nodeId: string,
  prefix: string,
  depth: number,
  maxDepth: number | undefined,
): string[] => {
  const node = map.nodes[nodeId];

  if (!node) {
    return [];
  }

  if (maxDepth !== undefined && depth >= maxDepth) {
    return [];
  }

  return node.children.flatMap((childId, index) => {
    const child = map.nodes[childId];

    if (!child) {
      return [];
    }

    const isLast = index === node.children.length - 1;
    const branch = isLast ? "└── " : "├── ";
    const childPrefix = `${prefix}${isLast ? "    " : "│   "}`;
    const lines = [`${prefix}${branch}${formatNodeLabel(child)}`];

    return [...lines, ...renderTreeLines(map, child.id, childPrefix, depth + 1, maxDepth)];
  });
};

export const renderTree = (
  map: MindMap,
  nodeId: string = map.rootId,
  maxDepth?: number,
): string => {
  const root = map.nodes[nodeId];

  if (!root) {
    return "";
  }

  const header = formatNodeLabel(root);
  const lines = renderTreeLines(map, root.id, "", 0, maxDepth);
  return [header, ...lines].join("\n");
};

export const mapToNodePayload = (node: MindMapNode) => ({
  id: node.id,
  text: node.text,
  notes: node.notes ?? null,
  parentId: node.parent,
  childIds: node.children,
  createdAt: node.createdAt,
  updatedAt: node.updatedAt,
});

export const printMapList = (
  maps: Array<{
    id: string;
    title: string;
    updatedAt: string;
    nodeCount: number;
    isActive: boolean;
  }>,
): void => {
  if (maps.length === 0) {
    printText(chalk.yellow("保存済みマップはありません"));
    return;
  }

  const lines = maps.map((map) => {
    const marker = map.isActive ? chalk.green("*") : " ";
    return `${marker} ${chalk.cyan(map.title)} ${chalk.gray(`[${map.id}]`)} nodes=${map.nodeCount} updated=${map.updatedAt}`;
  });

  printText(lines.join("\n"));
};

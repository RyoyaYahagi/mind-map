import type { MindMap, MindMapNode, NodeStyle } from "./types.js";
import { addNode, createMindMap, setNote } from "./tree.js";

type ParsedMarkdownNode = {
  depth: number;
  text: string;
  notes: string;
  children: ParsedMarkdownNode[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const trimBlankLines = (value: string): string => value.replace(/^\s*\n|\n\s*$/g, "").trim();

const ensureString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string") {
    throw new Error(`Invalid mind map JSON: ${fieldName} must be a string`);
  }

  return value;
};

const ensureOptionalString = (value: unknown, fieldName: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`Invalid mind map JSON: ${fieldName} must be a string`);
  }

  return value;
};

const ensureOptionalBoolean = (value: unknown, fieldName: string): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`Invalid mind map JSON: ${fieldName} must be a boolean`);
  }

  return value;
};

const validateStyle = (value: unknown, fieldName: string): NodeStyle | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`Invalid mind map JSON: ${fieldName} must be an object`);
  }

  return {
    color: ensureOptionalString(value.color, `${fieldName}.color`),
    icon: ensureOptionalString(value.icon, `${fieldName}.icon`),
  };
};

const validateNode = (value: unknown, key: string): MindMapNode => {
  if (!isRecord(value)) {
    throw new Error(`Invalid mind map JSON: node ${key} must be an object`);
  }

  if (!Array.isArray(value.children) || value.children.some((child) => typeof child !== "string")) {
    throw new Error(`Invalid mind map JSON: node ${key}.children must be a string array`);
  }

  if (value.parent !== null && typeof value.parent !== "string") {
    throw new Error(`Invalid mind map JSON: node ${key}.parent must be a string or null`);
  }

  return {
    id: ensureString(value.id, `node ${key}.id`),
    text: ensureString(value.text, `node ${key}.text`),
    notes: ensureOptionalString(value.notes, `node ${key}.notes`),
    children: [...value.children],
    parent: value.parent,
    collapsed: ensureOptionalBoolean(value.collapsed, `node ${key}.collapsed`),
    style: validateStyle(value.style, `node ${key}.style`),
    createdAt: ensureString(value.createdAt, `node ${key}.createdAt`),
    updatedAt: ensureString(value.updatedAt, `node ${key}.updatedAt`),
  };
};

const validateMindMap = (value: unknown): MindMap => {
  if (!isRecord(value)) {
    throw new Error("Invalid mind map JSON: root value must be an object");
  }

  if (value.version !== 1) {
    throw new Error("Invalid mind map JSON: version must be 1");
  }

  if (!isRecord(value.nodes)) {
    throw new Error("Invalid mind map JSON: nodes must be an object");
  }

  const nodes: Record<string, MindMapNode> = {};

  for (const [key, nodeValue] of Object.entries(value.nodes)) {
    const node = validateNode(nodeValue, key);

    if (node.id !== key) {
      throw new Error(`Invalid mind map JSON: node key mismatch for ${key}`);
    }

    nodes[key] = node;
  }

  const map: MindMap = {
    version: 1,
    id: ensureString(value.id, "id"),
    title: ensureString(value.title, "title"),
    rootId: ensureString(value.rootId, "rootId"),
    nodes,
    createdAt: ensureString(value.createdAt, "createdAt"),
    updatedAt: ensureString(value.updatedAt, "updatedAt"),
  };

  const root = map.nodes[map.rootId];

  if (!root) {
    throw new Error("Invalid mind map JSON: root node does not exist");
  }

  if (root.parent !== null) {
    throw new Error("Invalid mind map JSON: root node parent must be null");
  }

  for (const node of Object.values(map.nodes)) {
    for (const childId of node.children) {
      const child = map.nodes[childId];

      if (!child) {
        throw new Error(`Invalid mind map JSON: child node does not exist: ${childId}`);
      }

      if (child.parent !== node.id) {
        throw new Error(`Invalid mind map JSON: parent mismatch for node ${childId}`);
      }
    }

    if (node.parent !== null && !map.nodes[node.parent]) {
      throw new Error(`Invalid mind map JSON: parent node does not exist: ${node.parent}`);
    }
  }

  return map;
};

const renderNode = (map: MindMap, nodeId: string, depth: number): string[] => {
  const node = map.nodes[nodeId];

  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const lines = [`${"#".repeat(depth + 1)} ${node.text}`];

  if (node.notes && node.notes.trim().length > 0) {
    lines.push("", node.notes.trim());
  }

  for (const childId of node.children) {
    lines.push("", ...renderNode(map, childId, depth + 1));
  }

  return lines;
};

const parseMarkdown = (markdown: string): ParsedMarkdownNode => {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const rootNodes: ParsedMarkdownNode[] = [];
  const stack: ParsedMarkdownNode[] = [];
  let currentNode: ParsedMarkdownNode | null = null;
  let baseHeadingLevel: number | null = null;

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.*)$/.exec(line);

    if (match) {
      const headingLevel = match[1].length;

      if (baseHeadingLevel === null) {
        baseHeadingLevel = headingLevel;
      }

      const depth = Math.max(0, headingLevel - baseHeadingLevel);
      const node: ParsedMarkdownNode = {
        depth,
        text: match[2].trim(),
        notes: "",
        children: [],
      };

      while (stack.length > depth) {
        stack.pop();
      }

      const parent = stack[depth - 1];

      if (parent) {
        parent.children.push(node);
      } else {
        rootNodes.push(node);
      }

      stack[depth] = node;
      currentNode = node;
      continue;
    }

    if (currentNode) {
      currentNode.notes += currentNode.notes.length === 0 ? line : `\n${line}`;
    }
  }

  if (rootNodes.length === 0) {
    throw new Error("Markdown must contain at least one heading");
  }

  if (rootNodes.length > 1) {
    throw new Error("Markdown must contain a single root heading");
  }

  rootNodes[0].notes = trimBlankLines(rootNodes[0].notes);

  const trimNotes = (node: ParsedMarkdownNode): void => {
    node.notes = trimBlankLines(node.notes);

    for (const child of node.children) {
      trimNotes(child);
    }
  };

  trimNotes(rootNodes[0]);

  return rootNodes[0];
};

const buildMapFromParsedNode = (parsed: ParsedMarkdownNode): MindMap => {
  let map = createMindMap(parsed.text);

  if (parsed.notes.length > 0) {
    map = setNote(map, map.rootId, parsed.notes);
  }

  const appendChildren = (parentId: string, children: ParsedMarkdownNode[]): void => {
    for (const child of children) {
      const result = addNode(map, parentId, child.text);

      map = result.map;

      if (child.notes.length > 0) {
        map = setNote(map, result.node.id, child.notes);
      }

      appendChildren(result.node.id, child.children);
    }
  };

  appendChildren(map.rootId, parsed.children);

  return map;
};

export const toMarkdown = (map: MindMap): string => renderNode(map, map.rootId, 0).join("\n").trim();

export const fromMarkdown = (markdown: string): MindMap => buildMapFromParsedNode(parseMarkdown(markdown));

export const toJSON = (map: MindMap): string => JSON.stringify(map, null, 2);

export const fromJSON = (json: string): MindMap => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error("Invalid mind map JSON: failed to parse JSON");
  }

  return validateMindMap(parsed);
};

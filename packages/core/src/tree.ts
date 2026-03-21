import { nanoid } from "nanoid";

import type { MindMap, MindMapNode } from "./types.js";

const createTimestamp = (): string => new Date().toISOString();

const createNode = (
  text: string,
  parent: string | null,
  timestamp: string,
): MindMapNode => ({
  id: nanoid(12),
  text,
  children: [],
  parent,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const requireNode = (map: MindMap, nodeId: string): MindMapNode => {
  const node = map.nodes[nodeId];

  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  return node;
};

const cloneNodes = (map: MindMap): Record<string, MindMapNode> => ({ ...map.nodes });

const updateMap = (
  map: MindMap,
  nodes: Record<string, MindMapNode>,
  updatedAt: string,
  title: string = map.title,
): MindMap => ({
  ...map,
  title,
  nodes,
  updatedAt,
});

const collectDescendantIds = (map: MindMap, nodeId: string): string[] => {
  const ids: string[] = [];
  const stack = [nodeId];

  while (stack.length > 0) {
    const currentId = stack.pop();

    if (!currentId) {
      continue;
    }

    ids.push(currentId);

    for (const childId of requireNode(map, currentId).children) {
      stack.push(childId);
    }
  }

  return ids;
};

const isAncestor = (map: MindMap, ancestorId: string, nodeId: string): boolean => {
  let current: MindMapNode | undefined = map.nodes[nodeId];

  while (current?.parent) {
    if (current.parent === ancestorId) {
      return true;
    }

    current = map.nodes[current.parent];
  }

  return false;
};

export const createMindMap = (title: string): MindMap => {
  const timestamp = createTimestamp();
  const root = createNode(title, null, timestamp);

  return {
    version: 1,
    id: nanoid(12),
    title,
    rootId: root.id,
    nodes: {
      [root.id]: root,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const addNode = (
  map: MindMap,
  parentId: string,
  text: string,
): { map: MindMap; node: MindMapNode } => {
  const parent = requireNode(map, parentId);
  const timestamp = createTimestamp();
  const node = createNode(text, parentId, timestamp);
  const nodes = cloneNodes(map);

  nodes[node.id] = node;
  nodes[parentId] = {
    ...parent,
    children: [...parent.children, node.id],
    updatedAt: timestamp,
  };

  return {
    map: updateMap(map, nodes, timestamp),
    node,
  };
};

export const editNode = (map: MindMap, nodeId: string, text: string): MindMap => {
  const node = requireNode(map, nodeId);
  const timestamp = createTimestamp();
  const nodes = cloneNodes(map);

  nodes[nodeId] = {
    ...node,
    text,
    updatedAt: timestamp,
  };

  const title = nodeId === map.rootId ? text : map.title;

  return updateMap(map, nodes, timestamp, title);
};

export const setNote = (map: MindMap, nodeId: string, notes: string): MindMap => {
  const node = requireNode(map, nodeId);
  const timestamp = createTimestamp();
  const nodes = cloneNodes(map);

  nodes[nodeId] = {
    ...node,
    notes,
    updatedAt: timestamp,
  };

  return updateMap(map, nodes, timestamp);
};

export const deleteNode = (map: MindMap, nodeId: string): MindMap => {
  if (nodeId === map.rootId) {
    throw new Error("Cannot delete root node");
  }

  const node = requireNode(map, nodeId);
  const parent = requireNode(map, node.parent as string);
  const timestamp = createTimestamp();
  const nodes = cloneNodes(map);

  for (const descendantId of collectDescendantIds(map, nodeId)) {
    delete nodes[descendantId];
  }

  nodes[parent.id] = {
    ...parent,
    children: parent.children.filter((childId) => childId !== nodeId),
    updatedAt: timestamp,
  };

  return updateMap(map, nodes, timestamp);
};

export const moveNode = (map: MindMap, nodeId: string, newParentId: string): MindMap => {
  if (nodeId === map.rootId) {
    throw new Error("Cannot move root node");
  }

  const node = requireNode(map, nodeId);
  const currentParent = requireNode(map, node.parent as string);
  const newParent = requireNode(map, newParentId);

  if (nodeId === newParentId) {
    throw new Error("Cannot move node to itself");
  }

  if (isAncestor(map, nodeId, newParentId)) {
    throw new Error("Cannot move node into its own descendant");
  }

  if (node.parent === newParentId) {
    return map;
  }

  const timestamp = createTimestamp();
  const nodes = cloneNodes(map);

  nodes[currentParent.id] = {
    ...currentParent,
    children: currentParent.children.filter((childId) => childId !== nodeId),
    updatedAt: timestamp,
  };

  nodes[newParent.id] = {
    ...newParent,
    children: [...newParent.children, nodeId],
    updatedAt: timestamp,
  };

  nodes[nodeId] = {
    ...node,
    parent: newParentId,
    updatedAt: timestamp,
  };

  return updateMap(map, nodes, timestamp);
};

export const getNode = (map: MindMap, nodeId: string): MindMapNode | undefined => map.nodes[nodeId];

export const resolveNodeId = (map: MindMap, prefix: string): string | null => {
  const matchedIds = Object.keys(map.nodes).filter((nodeId) => nodeId.startsWith(prefix));

  return matchedIds.length === 1 ? matchedIds[0] : null;
};

export const getSubtree = (map: MindMap, nodeId: string): MindMapNode[] => {
  const root = requireNode(map, nodeId);
  const result: MindMapNode[] = [];
  const stack: MindMapNode[] = [root];

  while (stack.length > 0) {
    const current = stack.pop();

    if (!current) {
      continue;
    }

    result.push(current);

    for (let index = current.children.length - 1; index >= 0; index -= 1) {
      stack.push(requireNode(map, current.children[index]));
    }
  }

  return result;
};

export const getAncestors = (map: MindMap, nodeId: string): MindMapNode[] => {
  let current = requireNode(map, nodeId);
  const ancestors: MindMapNode[] = [];

  while (current.parent) {
    current = requireNode(map, current.parent);
    ancestors.push(current);
  }

  return ancestors.reverse();
};

export const searchNodes = (map: MindMap, query: string): MindMapNode[] => {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (normalizedQuery.length === 0) {
    return [];
  }

  return Object.values(map.nodes).filter((node) => {
    const text = node.text.toLocaleLowerCase();
    const notes = node.notes?.toLocaleLowerCase() ?? "";

    return text.includes(normalizedQuery) || notes.includes(normalizedQuery);
  });
};

export const getMapInfo = (
  map: MindMap,
): { nodeCount: number; maxDepth: number; title: string } => {
  requireNode(map, map.rootId);

  let maxDepth = 0;
  const queue: Array<{ id: string; depth: number }> = [{ id: map.rootId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    maxDepth = Math.max(maxDepth, current.depth);

    for (const childId of requireNode(map, current.id).children) {
      queue.push({ id: childId, depth: current.depth + 1 });
    }
  }

  return {
    nodeCount: Object.keys(map.nodes).length,
    maxDepth,
    title: map.title,
  };
};

import type { MindMap, MindMapNode, NodePosition } from "@mindmap/core";

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 84;
export const ROOT_NODE_WIDTH = 300;
export const ROOT_NODE_HEIGHT = 120;
const LEVEL_GAP = 280;
const SIBLING_GAP = 24;
const CHILD_OFFSET_X = 72;
const CHILD_OFFSET_Y = 96;

export const getNodeDimensions = (isRoot: boolean): { height: number; width: number } => ({
  height: isRoot ? ROOT_NODE_HEIGHT : NODE_HEIGHT,
  width: isRoot ? ROOT_NODE_WIDTH : NODE_WIDTH,
});

export const centerNodeAt = (position: NodePosition, isRoot: boolean): NodePosition => {
  const { height, width } = getNodeDimensions(isRoot);

  return {
    x: position.x - width / 2,
    y: position.y - height / 2,
  };
};

export const getNextChildPosition = (parent: MindMapNode, isRoot: boolean): NodePosition => {
  const { width } = getNodeDimensions(isRoot);

  return {
    x: (parent.position?.x ?? 0) + width + CHILD_OFFSET_X,
    y: (parent.position?.y ?? 0) + parent.children.length * CHILD_OFFSET_Y,
  };
};

const measureSubtreeHeight = (map: MindMap, nodeId: string, heights: Map<string, number>): number => {
  const node = map.nodes[nodeId];

  if (!node) {
    return NODE_HEIGHT;
  }

  const nodeHeight = getNodeDimensions(nodeId === map.rootId).height;

  if (node.children.length === 0) {
    heights.set(nodeId, nodeHeight);
    return nodeHeight;
  }

  const childHeightSum = node.children.reduce(
    (total, childId) => total + measureSubtreeHeight(map, childId, heights),
    0,
  );
  const height = Math.max(
    nodeHeight,
    childHeightSum + SIBLING_GAP * Math.max(0, node.children.length - 1),
  );

  heights.set(nodeId, height);
  return height;
};

export const getFallbackNodePositions = (map: MindMap): Record<string, NodePosition> => {
  const root = map.nodes[map.rootId];

  if (!root) {
    return {};
  }

  const heights = new Map<string, number>();
  measureSubtreeHeight(map, root.id, heights);
  const positions: Record<string, NodePosition> = {};

  const placeNode = (nodeId: string, xCenter: number, yCenter: number, side: "left" | "right" | "root"): void => {
    const node = map.nodes[nodeId];

    if (!node) {
      return;
    }

    const { height, width } = getNodeDimensions(nodeId === map.rootId);
    positions[nodeId] = {
      x: xCenter - width / 2,
      y: yCenter - height / 2,
    };

    if (node.children.length === 0) {
      return;
    }

    const children =
      side === "root"
        ? {
            left: node.children.slice(Math.ceil(node.children.length / 2)),
            right: node.children.slice(0, Math.ceil(node.children.length / 2)),
          }
        : { left: side === "left" ? node.children : [], right: side === "right" ? node.children : [] };

    const placeChildren = (childIds: string[], direction: "left" | "right") => {
      if (childIds.length === 0) {
        return;
      }

      const branchHeight =
        childIds.reduce((total, childId) => total + (heights.get(childId) ?? NODE_HEIGHT), 0) +
        SIBLING_GAP * Math.max(0, childIds.length - 1);
      let cursorY = yCenter - branchHeight / 2;

      for (const childId of childIds) {
        const childHeight = heights.get(childId) ?? NODE_HEIGHT;
        const childCenterY = cursorY + childHeight / 2;

        placeNode(
          childId,
          xCenter + (direction === "right" ? LEVEL_GAP : -LEVEL_GAP),
          childCenterY,
          direction,
        );

        cursorY += childHeight + SIBLING_GAP;
      }
    };

    placeChildren(children.right, "right");
    placeChildren(children.left, "left");
  };

  placeNode(root.id, ROOT_NODE_WIDTH / 2, ROOT_NODE_HEIGHT / 2, "root");

  return positions;
};

export const getNodePosition = (
  map: MindMap,
  nodeId: string,
  fallbackPositions: Record<string, NodePosition>,
): NodePosition => map.nodes[nodeId]?.position ?? fallbackPositions[nodeId] ?? { x: 0, y: 0 };

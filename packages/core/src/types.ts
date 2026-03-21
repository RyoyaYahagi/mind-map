export interface MindMapNode {
  id: string;
  text: string;
  notes?: string;
  children: string[];
  parent: string | null;
  collapsed?: boolean;
  style?: NodeStyle;
  createdAt: string;
  updatedAt: string;
}

export interface NodeStyle {
  color?: string;
  icon?: string;
}

export interface MindMap {
  version: 1;
  id: string;
  title: string;
  rootId: string;
  nodes: Record<string, MindMapNode>;
  createdAt: string;
  updatedAt: string;
}

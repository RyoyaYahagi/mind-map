import { useCallback, useEffect, useMemo, useState } from "react";

import type { MindMap, NodePosition } from "@mindmap/core";

import { useWebSocket } from "./useWebSocket.js";

type MapUpdateMessage = {
  type: "map:update";
  payload: MindMap;
};

type ErrorMessage = {
  type: "error";
  payload: {
    error?: string;
  };
};

type NodeAddAckMessage = {
  type: "node:add:ack";
  payload: {
    nodeId: string;
    requestId: string;
  };
};

export type WorkspaceSummary = {
  id: string;
  title: string;
  filePath: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  isActive: boolean;
};

type SocketMessage = MapUpdateMessage | ErrorMessage | NodeAddAckMessage | { type: string; payload?: unknown };

const SOCKET_URL = import.meta.env.VITE_WS_URL ?? "/ws";
const MAPS_URL = import.meta.env.VITE_MAPS_URL ?? "/api/maps";

export const useMindMap = () => {
  const [map, setMap] = useState<MindMap | null>(null);
  const [lastAddedNode, setLastAddedNode] = useState<{ nodeId: string; requestId: string } | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const response = await fetch(MAPS_URL, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Workspace list request failed: ${response.status}`);
      }

      const payload = (await response.json()) as WorkspaceSummary[];
      setWorkspaces(payload);
    } catch {
      // 一覧取得失敗は編集本体を止めない
    }
  }, []);

  const onMessage = useCallback((raw: string) => {
    try {
      const message = JSON.parse(raw) as SocketMessage;

      if (message.type === "map:update") {
        setMap(message.payload as MindMap);
        setServerError(null);
        return;
      }

      if (message.type === "error") {
        const payload = message.payload as { error?: string } | undefined;
        setServerError(payload?.error ?? "サーバーからエラーが返されました");
        return;
      }

      if (message.type === "node:add:ack") {
        const payload = message.payload as NodeAddAckMessage["payload"] | undefined;

        if (payload?.nodeId && payload.requestId) {
          setLastAddedNode({
            nodeId: payload.nodeId,
            requestId: payload.requestId,
          });
        }
      }
    } catch {
      setServerError("WebSocket メッセージの解析に失敗しました");
    }
  }, []);

  const { error: socketError, send, status } = useWebSocket({
    url: SOCKET_URL,
    onMessage,
  });

  useEffect(() => {
    if (!map) {
      return;
    }

    setServerError(null);
    void refreshWorkspaces();
  }, [map, refreshWorkspaces]);

  useEffect(() => {
    if (status !== "open") {
      return;
    }

    void refreshWorkspaces();
  }, [refreshWorkspaces, status]);

  const actions = useMemo(
    () => ({
      addNode: (parentId: string, text: string, position?: NodePosition) => {
        const requestId = crypto.randomUUID();
        const ok = send({
          type: "node:add",
          payload: {
            parentId,
            position,
            requestId,
            text,
          },
        });

        return ok ? requestId : null;
      },
      deleteNode: (nodeId: string) =>
        send({
          type: "node:delete",
          payload: {
            nodeId,
          },
        }),
      editNode: (nodeId: string, text: string) =>
        send({
          type: "node:edit",
          payload: {
            nodeId,
            text,
          },
        }),
      moveNode: (nodeId: string, newParentId: string) =>
        send({
          type: "node:move",
          payload: {
            newParentId,
            nodeId,
          },
        }),
      setNodePosition: (nodeId: string, position: NodePosition) =>
        send({
          type: "node:position",
          payload: {
            nodeId,
            position,
          },
        }),
      openWorkspace: (mapId: string) =>
        send({
          type: "map:open",
          payload: {
            mapId,
          },
        }),
    }),
    [send],
  );

  return {
    actions,
    error: socketError ?? serverError,
    lastAddedNode,
    map,
    refreshWorkspaces,
    status,
    workspaces,
  };
};

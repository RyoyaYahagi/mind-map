import { useCallback, useEffect, useMemo, useState } from "react";

import type { MindMap } from "@mindmap/core";

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

type SocketMessage = MapUpdateMessage | ErrorMessage | { type: string; payload?: unknown };

const SOCKET_URL = import.meta.env.VITE_WS_URL ?? "/ws";

export const useMindMap = () => {
  const [map, setMap] = useState<MindMap | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

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
  }, [map]);

  const actions = useMemo(
    () => ({
      addNode: (parentId: string, text: string) =>
        send({
          type: "node:add",
          payload: {
            parentId,
            text,
          },
        }),
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
    }),
    [send],
  );

  return {
    actions,
    error: socketError ?? serverError,
    map,
    status,
  };
};

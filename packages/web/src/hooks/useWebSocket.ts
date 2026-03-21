import { useCallback, useEffect, useRef, useState } from "react";

export type WebSocketStatus = "connecting" | "open" | "closed" | "error";

type UseWebSocketOptions = {
  url: string;
  onMessage: (data: string) => void;
  reconnectDelayMs?: number;
};

export const useWebSocket = ({ url, onMessage, reconnectDelayMs = 1500 }: UseWebSocketOptions) => {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(true);
  const onMessageRef = useRef(onMessage);

  const [status, setStatus] = useState<WebSocketStatus>("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    clearReconnectTimer();

    const socket = new WebSocket(url);
    socketRef.current = socket;
    setStatus("connecting");

    socket.addEventListener("open", () => {
      setStatus("open");
      setError(null);
    });

    socket.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        onMessageRef.current(event.data);
      }
    });

    socket.addEventListener("error", () => {
      setStatus("error");
      setError("WebSocket 接続でエラーが発生しました");
    });

    socket.addEventListener("close", () => {
      socketRef.current = null;

      if (!shouldReconnectRef.current) {
        setStatus("closed");
        return;
      }

      setStatus("closed");
      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, reconnectDelayMs);
    });
  }, [clearReconnectTimer, reconnectDelayMs, url]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();

    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [clearReconnectTimer, connect]);

  const send = useCallback((payload: unknown): boolean => {
    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify(payload));
    return true;
  }, []);

  return {
    error,
    send,
    status,
  };
};

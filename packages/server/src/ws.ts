import { WebSocket } from "ws";

type ClientState = {
  getActiveMapId: () => string | null;
};

export const clients = new Map<WebSocket, ClientState>();

export const addClient = (ws: WebSocket, getActiveMapId: () => string | null): void => {
  clients.set(ws, { getActiveMapId });
};

export const removeClient = (ws: WebSocket): void => {
  clients.delete(ws);
};

export const broadcast = (data: object, mapId?: string): void => {
  const message = JSON.stringify(data);

  for (const [client, state] of clients) {
    if (client.readyState !== WebSocket.OPEN) {
      clients.delete(client);
      continue;
    }

    if (mapId && state.getActiveMapId() !== mapId) {
      continue;
    }

    try {
      client.send(message);
    } catch {
      clients.delete(client);
    }
  }
};

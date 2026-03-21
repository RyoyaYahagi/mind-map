import { WebSocket } from "ws";

export const clients = new Set<WebSocket>();

export const addClient = (ws: WebSocket): void => {
  clients.add(ws);
};

export const removeClient = (ws: WebSocket): void => {
  clients.delete(ws);
};

export const broadcast = (data: object): void => {
  const message = JSON.stringify(data);

  for (const client of clients) {
    if (client.readyState !== WebSocket.OPEN) {
      clients.delete(client);
      continue;
    }

    try {
      client.send(message);
    } catch {
      clients.delete(client);
    }
  }
};

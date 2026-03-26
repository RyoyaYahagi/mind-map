import type { MindMap, NodePosition } from "@mindmap/core";
import { addNode, deleteNode, editNode, fromJSON, moveNode, setNodePosition, toJSON } from "@mindmap/core";
import { readFile, readdir, writeFile, mkdir, access, rename } from "node:fs/promises";
import { basename, join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { WebSocketServer, type WebSocket } from "ws";

import { addClient, broadcast, removeClient } from "./ws.js";
import { watchMaps } from "./watcher.js";

type MapSummary = {
  id: string;
  title: string;
  filePath: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  isActive: boolean;
};

type MapParams = {
  id: string;
};

type NodeParams = {
  id: string;
  nodeId: string;
};

type AddNodeBody = {
  parentId: string;
  text: string;
  position?: NodePosition;
  requestId?: string;
};

type EditNodeBody = {
  text: string;
};

type MoveNodeBody = {
  newParentId: string;
};

type SetNodePositionBody = {
  position: NodePosition;
};

type MessageEnvelope = {
  type: string;
  payload?: unknown;
};

const APP_DIR = join(homedir(), ".mindmap");
const MAPS_DIR = join(APP_DIR, "maps");
const CONFIG_PATH = join(APP_DIR, "config.json");
const MAP_SUFFIX = ".mindmap.json";
const LOCAL_WRITE_SUPPRESSION_MS = 250;

const localWriteSuppression = new Map<string, number>();

const ensureStorage = async (): Promise<void> => {
  await mkdir(MAPS_DIR, { recursive: true });
};

const isMapId = (value: string): boolean => /^[A-Za-z0-9_-]+$/u.test(value);

const getMapFilePath = (mapId: string): string => {
  if (!isMapId(mapId)) {
    throw new Error(`Invalid map id: ${mapId}`);
  }

  return join(MAPS_DIR, `${mapId}${MAP_SUFFIX}`);
};

const readConfig = async (): Promise<{ activeMapId: string | null }> => {
  await ensureStorage();

  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const activeMapId = parsed.activeMapId;

    if (activeMapId !== null && typeof activeMapId !== "string") {
      throw new Error("activeMapId must be a string or null");
    }

    return { activeMapId: activeMapId ?? null };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { activeMapId: null };
    }

    throw error;
  }
};

const loadMap = async (mapId: string): Promise<MindMap> => {
  const filePath = getMapFilePath(mapId);
  const raw = await readFile(filePath, "utf8");

  return fromJSON(raw);
};

const writeFileAtomically = async (filePath: string, contents: string): Promise<void> => {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, contents, "utf8");
  await rename(tempPath, filePath);
};

const saveMap = async (map: MindMap): Promise<void> => {
  const filePath = getMapFilePath(map.id);
  await writeFileAtomically(filePath, `${toJSON(map)}\n`);
};

const listMapIds = async (): Promise<string[]> => {
  await ensureStorage();
  const entries = await readdir(MAPS_DIR, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(MAP_SUFFIX))
    .map((entry) => basename(entry.name, MAP_SUFFIX))
    .filter(isMapId);
};

const listMaps = async (): Promise<MapSummary[]> => {
  const config = await readConfig();
  const mapIds = await listMapIds();
  const maps = await Promise.all(
    mapIds.map(async (mapId) => {
      const map = await loadMap(mapId);

      return {
        id: map.id,
        title: map.title,
        filePath: getMapFilePath(map.id),
        createdAt: map.createdAt,
        updatedAt: map.updatedAt,
        nodeCount: Object.keys(map.nodes).length,
        isActive: config.activeMapId === map.id,
      } satisfies MapSummary;
    }),
  );

  return maps.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

const loadActiveMap = async (): Promise<MindMap | null> => {
  const config = await readConfig();

  if (config.activeMapId) {
    return await loadMap(config.activeMapId);
  }

  const maps = await listMaps();

  if (maps.length === 0) {
    return null;
  }

  return await loadMap(maps[0].id);
};

const assertString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }

  return value;
};

const assertOptionalString = (value: unknown, fieldName: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return assertString(value, fieldName);
};

const assertPosition = (value: unknown, fieldName: string): NodePosition => {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${fieldName} must be an object`);
  }

  const x = (value as { x?: unknown }).x;
  const y = (value as { y?: unknown }).y;

  if (typeof x !== "number" || Number.isNaN(x)) {
    throw new Error(`${fieldName}.x must be a number`);
  }

  if (typeof y !== "number" || Number.isNaN(y)) {
    throw new Error(`${fieldName}.y must be a number`);
  }

  return { x, y };
};

const respondWithError = (error: unknown): { error: string } => ({
  error: error instanceof Error ? error.message : "Unknown error",
});

const markLocalWrite = (mapId: string): void => {
  localWriteSuppression.set(mapId, Date.now() + LOCAL_WRITE_SUPPRESSION_MS);
};

const shouldSuppressMapChange = (mapId: string): boolean => {
  const expiresAt = localWriteSuppression.get(mapId);

  if (!expiresAt) {
    return false;
  }

  if (Date.now() >= expiresAt) {
    localWriteSuppression.delete(mapId);
    return false;
  }

  return true;
};

const sendActiveMap = async (ws: WebSocket): Promise<string | null> => {
  const map = await loadActiveMap();

  if (!map) {
    return null;
  }

  ws.send(JSON.stringify({ type: "map:update", payload: map }));
  return map.id;
};

const handleMapChange = async (mapId: string): Promise<void> => {
  if (shouldSuppressMapChange(mapId)) {
    return;
  }

  try {
    const map = await loadMap(mapId);
    broadcast({ type: "map:update", payload: map });
  } catch {
    // 破損ファイルは監視対象外として扱い、配信だけ止める
  }
};

const updateMapAndPersist = async (mapId: string, updater: (map: MindMap) => MindMap): Promise<MindMap> => {
  const map = await loadMap(mapId);
  const nextMap = updater(map);

  await saveMapAndBroadcast(nextMap);

  return nextMap;
};

const saveMapAndBroadcast = async (nextMap: MindMap): Promise<void> => {
  await saveMap(nextMap);
  markLocalWrite(nextMap.id);
  broadcast({ type: "map:update", payload: nextMap });
};

const findWebDistDir = async (): Promise<string | null> => {
  const thisFile = fileURLToPath(import.meta.url);
  const candidates = [
    join(dirname(thisFile), "..", "..", "web", "dist"),
    join(dirname(thisFile), "..", "..", "..", "packages", "web", "dist"),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // not found, try next
    }
  }

  return null;
};

export const startServer = async (port: number): Promise<FastifyInstance> => {
  await ensureStorage();

  const fastify = Fastify({ logger: true });
  const wss = new WebSocketServer({ noServer: true });

  const webDistDir = await findWebDistDir();

  if (webDistDir) {
    await fastify.register(fastifyStatic, {
      root: webDistDir,
      prefix: "/",
    });

    // SPA fallback: /api 以外の未知ルートは index.html を返す
    fastify.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith("/api")) {
        reply.code(404).send({ error: "Not Found" });
        return;
      }

      return reply.sendFile("index.html");
    });
  }

  const watcher = watchMaps((mapId) => {
    void handleMapChange(mapId);
  });

  fastify.addHook("onClose", async () => {
    await watcher.close();
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
  });

  fastify.get("/api/maps", async () => listMaps());

  fastify.get<{ Params: MapParams }>("/api/maps/:id", async (request, reply) => {
    try {
      return await loadMap(request.params.id);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reply.code(404);
      } else {
        reply.code(500);
      }
      return respondWithError(error);
    }
  });

  fastify.post<{ Params: MapParams; Body: AddNodeBody }>(
    "/api/maps/:id/nodes",
    async (request, reply) => {
      try {
        const parentId = assertString(request.body.parentId, "parentId");
        const text = assertString(request.body.text, "text");
        const position =
          request.body.position === undefined
            ? undefined
            : assertPosition(request.body.position, "position");
        const nextMap = await updateMapAndPersist(request.params.id, (map) =>
          addNode(map, parentId, text, position).map,
        );

        return nextMap;
      } catch (error) {
        reply.code((error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 400);
        return respondWithError(error);
      }
    },
  );

  fastify.patch<{ Params: NodeParams; Body: EditNodeBody }>(
    "/api/maps/:id/nodes/:nodeId",
    async (request, reply) => {
      try {
        const text = assertString(request.body.text, "text");
        const nextMap = await updateMapAndPersist(request.params.id, (map) =>
          editNode(map, request.params.nodeId, text),
        );

        return nextMap;
      } catch (error) {
        reply.code((error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 400);
        return respondWithError(error);
      }
    },
  );

  fastify.delete<{ Params: NodeParams }>("/api/maps/:id/nodes/:nodeId", async (request, reply) => {
    try {
      const nextMap = await updateMapAndPersist(request.params.id, (map) =>
        deleteNode(map, request.params.nodeId),
      );

      return nextMap;
    } catch (error) {
      reply.code((error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 400);
      return respondWithError(error);
    }
  });

  fastify.server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      addClient(ws);
      let activeMapId: string | null = null;

      ws.on("close", () => {
        removeClient(ws);
      });

      ws.on("message", (raw) => {
        void (async () => {
          try {
            const parsed = JSON.parse(raw.toString()) as MessageEnvelope;

            if (!activeMapId) {
              const initialMap = await loadActiveMap();

              if (!initialMap) {
                throw new Error("No active map is available");
              }

              activeMapId = initialMap.id;
            }

            if (parsed.type === "node:add") {
              const payload = parsed.payload as AddNodeBody;
              const parentId = assertString(payload.parentId, "parentId");
              const text = assertString(payload.text, "text");
              const position =
                payload.position === undefined
                  ? undefined
                  : assertPosition(payload.position, "position");
              const requestId = assertOptionalString(payload.requestId, "requestId");
              const map = await loadMap(activeMapId);
              const added = addNode(map, parentId, text, position);

              await saveMapAndBroadcast(added.map);

              if (requestId) {
                ws.send(
                  JSON.stringify({
                    type: "node:add:ack",
                    payload: {
                      nodeId: added.node.id,
                      requestId,
                    },
                  }),
                );
              }
              return;
            }

            if (parsed.type === "node:edit") {
              const payload = parsed.payload as { nodeId: string; text: string };
              const nodeId = assertString(payload.nodeId, "nodeId");
              const text = assertString(payload.text, "text");

              await updateMapAndPersist(activeMapId, (map) => editNode(map, nodeId, text));
              return;
            }

            if (parsed.type === "node:delete") {
              const payload = parsed.payload as { nodeId: string };
              const nodeId = assertString(payload.nodeId, "nodeId");

              await updateMapAndPersist(activeMapId, (map) => deleteNode(map, nodeId));
              return;
            }

            if (parsed.type === "node:move") {
              const payload = parsed.payload as MoveNodeBody & { nodeId: string };
              const nodeId = assertString(payload.nodeId, "nodeId");
              const newParentId = assertString(payload.newParentId, "newParentId");

              await updateMapAndPersist(activeMapId, (map) => moveNode(map, nodeId, newParentId));
              return;
            }

            if (parsed.type === "node:position") {
              const payload = parsed.payload as SetNodePositionBody & { nodeId: string };
              const nodeId = assertString(payload.nodeId, "nodeId");
              const position = assertPosition(payload.position, "position");

              await updateMapAndPersist(activeMapId, (map) => setNodePosition(map, nodeId, position));
            }
          } catch (error) {
            ws.send(JSON.stringify({ type: "error", payload: respondWithError(error) }));
          }
        })();
      });

      void (async () => {
        try {
          activeMapId = await sendActiveMap(ws);
        } catch (error) {
          ws.send(JSON.stringify({ type: "error", payload: respondWithError(error) }));
        }
      })();
    });
  });

  await fastify.listen({ port, host: "0.0.0.0" });

  return fastify;
};

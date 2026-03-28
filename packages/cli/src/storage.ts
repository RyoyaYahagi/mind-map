import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";

import { fromJSON } from "@mindmap/core";
import type { MindMap } from "@mindmap/core";

export type CliErrorCode =
  | "ACTIVE_MAP_NOT_FOUND"
  | "CONFIG_INVALID"
  | "INVALID_ARGUMENT"
  | "MAP_NAME_AMBIGUOUS"
  | "MAP_NOT_FOUND"
  | "MAP_STORAGE_INVALID"
  | "NODE_ID_AMBIGUOUS"
  | "NODE_NOT_FOUND";

export class CliError extends Error {
  readonly code: CliErrorCode;

  constructor(code: CliErrorCode, message: string) {
    super(message);
    this.name = "CliError";
    this.code = code;
  }
}

export interface CliConfig {
  activeMapId: string | null;
}

export interface StoredMapSummary {
  id: string;
  title: string;
  filePath: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  isActive: boolean;
}

const DEFAULT_CONFIG: CliConfig = {
  activeMapId: null,
};

const APP_DIR = resolve(homedir(), ".mindmap");
const MAPS_DIR = join(APP_DIR, "maps");
const CONFIG_PATH = join(APP_DIR, "config.json");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const ensureStorage = async (): Promise<void> => {
  await mkdir(MAPS_DIR, { recursive: true });
};

export const getConfigPath = (): string => CONFIG_PATH;

export const getMapsDir = (): string => MAPS_DIR;

export const getMapFilePath = (mapId: string): string => join(MAPS_DIR, `${mapId}.mindmap.json`);

const writeFileAtomically = async (filePath: string, contents: string): Promise<void> => {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, contents, "utf8");
  await rename(tempPath, filePath);
};

export const loadConfig = async (): Promise<CliConfig> => {
  await ensureStorage();

  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!isRecord(parsed)) {
      throw new CliError("CONFIG_INVALID", "設定ファイルが不正です");
    }

    const { activeMapId } = parsed;

    if (activeMapId !== null && typeof activeMapId !== "string") {
      throw new CliError("CONFIG_INVALID", "activeMapId は string または null である必要があります");
    }

    return {
      activeMapId: activeMapId ?? null,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return DEFAULT_CONFIG;
    }

    if (error instanceof CliError) {
      throw error;
    }

    throw new CliError("CONFIG_INVALID", "設定ファイルの読み込みに失敗しました");
  }
};

export const saveConfig = async (config: CliConfig): Promise<void> => {
  await ensureStorage();
  await writeFileAtomically(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
};

const parseMapFile = async (filePath: string): Promise<MindMap> => {
  try {
    const raw = await readFile(filePath, "utf8");
    return fromJSON(raw);
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    const fileName = basename(filePath);
    throw new CliError("MAP_STORAGE_INVALID", `マップファイル ${fileName} の読み込みに失敗しました`);
  }
};

export const saveMap = async (map: MindMap): Promise<string> => {
  await ensureStorage();
  const filePath = getMapFilePath(map.id);
  await writeFileAtomically(filePath, `${JSON.stringify(map, null, 2)}\n`);
  return filePath;
};

export const loadMapById = async (mapId: string): Promise<MindMap> => {
  const filePath = getMapFilePath(mapId);

  try {
    return await parseMapFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CliError("MAP_NOT_FOUND", `マップが見つかりません: ${mapId}`);
    }

    throw error;
  }
};

const listMapIdsFromDisk = async (): Promise<string[]> => {
  await ensureStorage();
  const entries = await readdir(MAPS_DIR, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mindmap.json"))
    .map((entry) => entry.name.replace(/\.mindmap\.json$/u, ""));
};

export const listMaps = async (): Promise<StoredMapSummary[]> => {
  const config = await loadConfig();
  const mapIds = await listMapIdsFromDisk();
  const summaries = await Promise.all(
    mapIds.map(async (mapId) => {
      const map = await loadMapById(mapId);

      return {
        id: map.id,
        title: map.title,
        filePath: getMapFilePath(map.id),
        createdAt: map.createdAt,
        updatedAt: map.updatedAt,
        nodeCount: Object.keys(map.nodes).length,
        isActive: config.activeMapId === map.id,
      } satisfies StoredMapSummary;
    }),
  );

  return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

export const setActiveMapId = async (mapId: string | null): Promise<void> => {
  await saveConfig({ activeMapId: mapId });
};

export const loadActiveMap = async (): Promise<MindMap> => {
  const config = await loadConfig();

  if (!config.activeMapId) {
    throw new CliError("ACTIVE_MAP_NOT_FOUND", "アクティブなマップが設定されていません");
  }

  try {
    return await loadMapById(config.activeMapId);
  } catch (error) {
    if (error instanceof CliError && error.code === "MAP_NOT_FOUND") {
      throw new CliError("ACTIVE_MAP_NOT_FOUND", "設定されているアクティブマップが見つかりません");
    }

    throw error;
  }
};

export const resolveStoredMapId = async (input: string): Promise<string> => {
  const normalized = input.trim();

  if (normalized.length === 0) {
    throw new CliError("INVALID_ARGUMENT", "マップ名またはIDを指定してください");
  }

  const maps = await listMaps();
  const exactId = maps.find((map) => map.id === normalized);

  if (exactId) {
    return exactId.id;
  }

  const idMatches = maps.filter((map) => map.id.startsWith(normalized));

  if (idMatches.length === 1) {
    return idMatches[0].id;
  }

  if (idMatches.length > 1) {
    throw new CliError(
      "MAP_NAME_AMBIGUOUS",
      `複数のマップIDが ${normalized} に一致しました`,
    );
  }

  const titleMatches = maps.filter((map) => map.title === normalized);

  if (titleMatches.length === 1) {
    return titleMatches[0].id;
  }

  if (titleMatches.length > 1) {
    throw new CliError("MAP_NAME_AMBIGUOUS", `同名のマップが複数あります: ${normalized}`);
  }

  throw new CliError("MAP_NOT_FOUND", `マップが見つかりません: ${normalized}`);
};

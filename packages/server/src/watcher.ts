import chokidar, { type FSWatcher } from "chokidar";
import { basename, join } from "node:path";
import { homedir } from "node:os";

const MAPS_DIR = join(homedir(), ".mindmap", "maps");
const MAP_SUFFIX = ".mindmap.json";

const extractMapId = (filePath: string): string | null => {
  const fileName = basename(filePath);

  if (!fileName.endsWith(MAP_SUFFIX)) {
    return null;
  }

  const mapId = fileName.slice(0, -MAP_SUFFIX.length);

  if (!/^[A-Za-z0-9_-]+$/u.test(mapId)) {
    return null;
  }

  return mapId;
};

export const watchMaps = (onChange: (mapId: string) => void): FSWatcher => {
  const watcher = chokidar.watch(join(MAPS_DIR, `*${MAP_SUFFIX}`), {
    ignoreInitial: true,
  });

  const handleChange = (filePath: string): void => {
    const mapId = extractMapId(filePath);

    if (mapId) {
      onChange(mapId);
    }
  };

  watcher.on("add", handleChange);
  watcher.on("change", handleChange);

  return watcher;
};

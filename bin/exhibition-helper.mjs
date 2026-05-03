#!/usr/bin/env node
import { createServer } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT = 4177;
const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || process.cwd());
const port = Number(args.port || process.env.PORT || DEFAULT_PORT);
const host = args.host || "127.0.0.1";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".mov", "video/quicktime"]
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
    if (url.pathname === "/__p5em/files") {
      const files = await listHtmlFiles(root);
      sendJson(response, { root, files });
      return;
    }
    await serveStatic(root, url.pathname, response);
  } catch (error) {
    response.writeHead(error.statusCode || 500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error.message || "Server error");
  }
});

server.listen(port, host, () => {
  console.log(`Exhibition helper serving ${root}`);
  console.log(`Open http://${host}:${port}/`);
  console.log(`HTML index endpoint http://${host}:${port}/__p5em/files`);
});

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") parsed.root = argv[++i];
    else if (arg === "--port") parsed.port = argv[++i];
    else if (arg === "--host") parsed.host = argv[++i];
  }
  return parsed;
}

async function listHtmlFiles(baseDir) {
  const files = [];
  await walk(baseDir, files);
  return files
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => ({
      ...file,
      path: `./${file.path}`
    }));
}

async function walk(dir, files) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, files);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
      const stat = await fs.stat(fullPath);
      files.push({
        name: entry.name,
        path: toPosix(path.relative(root, fullPath)),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString()
      });
    }
  }
}

async function serveStatic(baseDir, pathname, response) {
  const decoded = decodeURIComponent(pathname);
  const requested = decoded === "/" ? "/index.html" : decoded;
  const filePath = path.resolve(baseDir, `.${requested}`);
  if (!filePath.startsWith(baseDir)) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }

  let stat;
  try {
    stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      return serveStatic(baseDir, path.posix.join(pathname, "index.html"), response);
    }
  } catch {
    const error = new Error("Not found");
    error.statusCode = 404;
    throw error;
  }

  const ext = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "content-type": mimeTypes.get(ext) || "application/octet-stream",
    "content-length": stat.size,
    "cache-control": "no-store"
  });
  createReadStream(filePath).pipe(response);
}

function sendJson(response, data) {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*"
  });
  response.end(JSON.stringify(data, null, 2));
}

function toPosix(value) {
  return value.split(path.sep).join(path.posix.sep);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.on("SIGINT", () => {
    server.close(() => process.exit(0));
  });
}

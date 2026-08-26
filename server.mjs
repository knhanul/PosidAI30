import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import worker from "./dist/server/index.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";
const clientRoot = join(process.cwd(), "dist", "client");

const contentTypes = {
  ".css": "text/css; charset=utf-8", ".gif": "image/gif", ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2",
};

function safeAssetPath(url) {
  const pathname = decodeURIComponent(new URL(url).pathname);
  const normalized = normalize(pathname).replace(/^[/\\]+/, "");
  if (!normalized || normalized.startsWith("..") || normalized.includes("../")) return null;
  return join(clientRoot, normalized);
}

const assets = {
  async fetch(request) {
    const filePath = safeAssetPath(request.url);
    if (!filePath) return new Response("Not found", { status: 404 });
    try {
      const info = await stat(filePath);
      if (!info.isFile()) return new Response("Not found", { status: 404 });
      const bytes = await readFile(filePath);
      const type = contentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream";
      return new Response(bytes, { headers: { "content-type": type, "cache-control": "public, max-age=3600" } });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
};

const server = createServer(async (incoming, outgoing) => {
  try {
    const origin = `http://${incoming.headers.host ?? `localhost:${port}`}`;
    const url = new URL(incoming.url ?? "/", origin);

    // Serve static assets directly from dist/client before delegating to the
    // Vinext worker. The worker's ASSETS binding may not resolve all paths.
    if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/brand/")) {
      const assetResponse = await assets.fetch(new Request(url));
      outgoing.statusCode = assetResponse.status;
      assetResponse.headers.forEach((value, name) => outgoing.setHeader(name, value));
      outgoing.end(Buffer.from(await assetResponse.arrayBuffer()));
      return;
    }

    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
      else if (value !== undefined) headers.set(name, value);
    }

    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(url, { method: incoming.method, headers, body, duplex: body ? "half" : undefined });
    const waitUntilTasks = [];
    const response = await worker.fetch(request, { ASSETS: assets }, { waitUntil(task) { waitUntilTasks.push(task); }, passThroughOnException() {} });

    outgoing.statusCode = response.status;
    response.headers.forEach((value, name) => outgoing.setHeader(name, value));
    const responseBody = Buffer.from(await response.arrayBuffer());
    outgoing.end(responseBody);
    Promise.allSettled(waitUntilTasks).catch(() => {});
  } catch (error) {
    console.error(error);
    outgoing.statusCode = 500;
    outgoing.end("Internal Server Error");
  }
});

server.listen(port, host, () => console.log(`Posid AI담당관3.0 listening on ${host}:${port}`));

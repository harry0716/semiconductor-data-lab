import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 4174);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

function resolvePath(url) {
  const cleanUrl = decodeURIComponent(url.split("?")[0]);
  const relative = cleanUrl === "/" ? "frontend/index.html" : cleanUrl.replace(/^\/+/, "");
  const filePath = normalize(join(root, relative));
  if (!filePath.startsWith(root)) return null;
  return filePath;
}

const server = createServer(async (req, res) => {
  try {
    const filePath = resolvePath(req.url || "/");
    if (!filePath || !existsSync(filePath)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const data = await readFile(filePath);
    res.writeHead(200, {
      "content-type": types[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(data);
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Server error: ${error.message}`);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Semiconductor Process Data Lab running at http://127.0.0.1:${port}/frontend/index.html`);
});


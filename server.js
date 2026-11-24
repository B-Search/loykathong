"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { MongoClient } = require("mongodb");

const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const REQUEST_LIMIT_BYTES = 16 * 1024;
const WRITE_WINDOW_MS = 15 * 60 * 1000;
const WRITE_LIMIT = 50;
const configuredOrigin = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : null;
const client = process.env.MONGODB_URI
  ? new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 10, serverSelectionTimeoutMS: 5000 })
  : null;
const databaseName = process.env.MONGODB_DB || "loykrathong";
const writesByAddress = new Map();
let wishesCollection = null;
let databaseReady = null;
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".svg": "image/svg+xml"
};
const designOptions = {
  base: new Set(["banana", "bread", "leaf"]),
  flower: new Set(["lotus", "marigold", "orchid"]),
  color: new Set(["gold", "pink", "green", "orange"]),
  candle: new Set(["taper", "lotus", "glow"])
};

class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(value));
}

function assertSameOrigin(request) {
  const expected = configuredOrigin || `${process.env.NODE_ENV === "production" ? "https" : "http"}://${request.headers.host}`;
  if (!request.headers.origin || request.headers.origin !== expected) {
    throw new ApiError(403, "origin_not_allowed");
  }
}

function clientAddress(request) {
  if (process.env.TRUST_PROXY === "true") {
    const forwarded = request.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length) return forwarded.split(",")[0].trim();
  }
  return request.socket.remoteAddress || "unknown";
}

function limitWrites(request) {
  const now = Date.now();
  for (const [address, entry] of writesByAddress) {
    if (entry.expiresAt <= now) writesByAddress.delete(address);
  }
  const address = clientAddress(request);
  let entry = writesByAddress.get(address);
  if (!entry) {
    if (writesByAddress.size >= 1000) throw new ApiError(429, "too_many_writes");
    entry = { count: 0, expiresAt: now + WRITE_WINDOW_MS };
    writesByAddress.set(address, entry);
  }
  if (entry.count >= WRITE_LIMIT) throw new ApiError(429, "too_many_writes");
  entry.count += 1;
}

async function readJson(request) {
  if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "json_required");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > REQUEST_LIMIT_BYTES) throw new ApiError(413, "request_too_large");
    chunks.push(chunk);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "invalid_json");
  }
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new ApiError(400, "invalid_json");
  }
  return value;
}

function validateWish(body) {
  const wish = typeof body.wish === "string" ? body.wish.trim() : "";
  const sharedText = typeof body.sharedText === "string" ? body.sharedText.trim() : wish;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const design = body.design;
  if (!wish || wish.length > 500 || sharedText.length > 500 || name.length > 50) {
    throw new ApiError(400, "invalid_wish");
  }
  if (!design || typeof design !== "object" || Array.isArray(design) ||
      !designOptions.base.has(design.base) || !designOptions.flower.has(design.flower) ||
      !designOptions.color.has(design.color) || !designOptions.candle.has(design.candle) ||
      typeof design.incense !== "boolean") {
    throw new ApiError(400, "invalid_design");
  }
  return {
    id: crypto.randomUUID(),
    name: name || "A friend",
    wish,
    sharedText,
    grudge: body.grudge === true,
    design: {
      base: design.base,
      flower: design.flower,
      color: design.color,
      candle: design.candle,
      incense: design.incense
    }
  };
}

function presentWish(document) {
  const { _id, createdAt, ...wish } = document;
  return { ...wish, id: _id, date: createdAt.toISOString() };
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/status" && request.method === "GET") {
    sendJson(response, 200, { enabled: Boolean(wishesCollection) });
    return;
  }
  if (!wishesCollection) {
    sendJson(response, 503, { error: "backend_unconfigured" });
    return;
  }

  if (url.pathname === "/api/wishes" && request.method === "GET") {
    const documents = await wishesCollection.find({})
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();
    sendJson(response, 200, { wishes: documents.map(presentWish) });
    return;
  }

  if (url.pathname === "/api/wishes" && request.method === "POST") {
    assertSameOrigin(request);
    limitWrites(request);
    const wish = validateWish(await readJson(request));
    if (await wishesCollection.countDocuments({}) >= 500) {
      throw new ApiError(409, "wish_limit_reached");
    }
    const createdAt = new Date();
    const { id, ...fields } = wish;
    const document = { _id: id, ...fields, createdAt };
    await wishesCollection.insertOne(document);
    sendJson(response, 201, { wish: presentWish(document) });
    return;
  }

  throw new ApiError(404, "not_found");
}

async function serveStatic(request, response, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method Not Allowed");
    return;
  }
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const segments = relativePath.split("/");
  if (!["index.html", "css", "js", "assets"].includes(segments[0]) ||
      segments.some((segment) => segment.startsWith("."))) {
    response.writeHead(404);
    response.end("Not Found");
    return;
  }
  const filePath = path.resolve(ROOT, relativePath);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
    response.writeHead(404);
    response.end("Not Found");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      const status = error.code === "ENOENT" || error.code === "EISDIR" ? 404 : 500;
      response.writeHead(status);
      response.end(status === 404 ? "Not Found" : "Unable to read file");
      if (status === 500) console.error(`Could not read ${filePath}:`, error);
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": content.length,
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : content);
  });
}

function handleRequest(request, response) {
  const handle = async () => {
    let url;
    try {
      url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    } catch {
      sendJson(response, 400, { error: "invalid_url" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    await serveStatic(request, response, decodeURIComponent(url.pathname));
  };

  handle().catch((error) => {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    if (error instanceof ApiError) {
      sendJson(response, error.status, { error: error.code });
      return;
    }
    console.error("Request failed:", error);
    sendJson(response, 500, { error: "server_error" });
  });
}

const server = http.createServer(handleRequest);

async function connectToDatabase() {
  if (!client) return;
  if (!databaseReady) {
    databaseReady = client.connect()
      .then(async () => {
        const database = client.db(databaseName);
        wishesCollection = database.collection("shared_wishes");
        await wishesCollection.createIndex({ createdAt: -1 });
        console.log(`MongoDB Atlas is connected; shared wish storage is ready in "${databaseName}".`);
      })
      .catch((error) => {
        wishesCollection = null;
        databaseReady = null;
        throw error;
      });
  }
  await databaseReady;
}

async function vercelHandler(request, response) {
  let isApiRequest = false;
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    isApiRequest = url.pathname.startsWith("/api/");
  } catch {
    handleRequest(request, response);
    return;
  }

  if (isApiRequest && client) {
    try {
      await connectToDatabase();
    } catch (error) {
      console.error("Could not connect to MongoDB Atlas:", error.message);
      sendJson(response, 503, { error: "backend_unavailable" });
      return;
    }
  }
  handleRequest(request, response);
}

async function startServer() {
  if (process.env.NODE_ENV === "production" && !client) {
    throw new Error("MONGODB_URI must be configured before production startup.");
  }
  if (client) {
    await connectToDatabase();
  } else {
    console.warn("MONGODB_URI is not set; the shared River backend is disabled.");
  }
  server.listen(PORT, HOST, () => {
    console.log(`Moonlit River is available at http://${HOST}:${PORT}`);
    if (process.env.NODE_ENV !== "production") console.log("Press Ctrl+C to stop the server.");
  });
}

module.exports = vercelHandler;
module.exports.server = server;
module.exports.startServer = startServer;
module.exports.validateWish = validateWish;

if (require.main === module) {
  startServer().catch(async (error) => {
    console.error("Could not start the application:", error.message);
    if (client) await client.close();
    process.exitCode = 1;
  });
}

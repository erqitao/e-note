const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const SECURE_COOKIES = process.env.SECURE_COOKIES === "true";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

let writeQueue = Promise.resolve();

async function ensureDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.writeFile(
      DB_FILE,
      JSON.stringify({ users: [], sessions: [], notes: [] }, null, 2)
    );
  }
}

async function readDb() {
  await ensureDb();
  const raw = await fs.readFile(DB_FILE, "utf8");
  return JSON.parse(raw);
}

async function writeDb(db) {
  writeQueue = writeQueue.then(() =>
    fs.writeFile(DB_FILE, JSON.stringify(db, null, 2))
  );
  return writeQueue;
}

async function updateDb(mutator) {
  const db = await readDb();
  const result = await mutator(db);
  await writeDb(db);
  return result;
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(payload);
}

function sendJson(res, status, body, headers = {}) {
  send(res, status, body, headers);
}

function randomId() {
  return crypto.randomBytes(16).toString("hex");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((item) => item.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)])
  );
}

function sessionCookie(token, maxAgeSeconds = SESSION_TTL_MS / 1000) {
  const secure = SECURE_COOKIES ? "; Secure" : "";
  return `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(maxAgeSeconds)}${secure}`;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON body.");
    error.status = 400;
    throw error;
  }
}

async function getCurrentUser(req) {
  const token = parseCookies(req).session;
  if (!token) return null;
  const now = Date.now();
  const db = await readDb();
  const session = db.sessions.find((item) => item.token === token && item.expiresAt > now);
  if (!session) return null;
  const user = db.users.find((item) => item.id === session.userId);
  if (!user) return null;
  return { id: user.id, email: user.email, name: user.name };
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}

function validateAuthInput(email, password) {
  if (!email || !email.includes("@")) return "请输入有效邮箱。";
  if (!password || password.length < 8) return "密码至少需要 8 位。";
  return null;
}

function notePayload(note) {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt
  };
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/me") {
    const user = await getCurrentUser(req);
    return sendJson(res, 200, { user });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const { email: rawEmail, password, name } = await readBody(req);
    const email = normalizeEmail(rawEmail);
    const error = validateAuthInput(email, password);
    if (error) return sendJson(res, 400, { error });

    return updateDb((db) => {
      if (db.users.some((user) => user.email === email)) {
        return sendJson(res, 409, { error: "这个邮箱已经注册。" });
      }
      const now = new Date().toISOString();
      const user = {
        id: randomId(),
        email,
        name: String(name || "").trim() || email.split("@")[0],
        passwordHash: hashPassword(password),
        createdAt: now,
        updatedAt: now
      };
      const token = randomId();
      db.users.push(user);
      db.sessions.push({ token, userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS });
      return sendJson(res, 201, { user: publicUser(user) }, { "Set-Cookie": sessionCookie(token) });
    });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const { email: rawEmail, password } = await readBody(req);
    const email = normalizeEmail(rawEmail);
    if (!email || !password) return sendJson(res, 400, { error: "请输入邮箱和密码。" });

    return updateDb((db) => {
      const user = db.users.find((item) => item.email === email);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return sendJson(res, 401, { error: "邮箱或密码不正确。" });
      }
      const token = randomId();
      const now = Date.now();
      db.sessions = db.sessions.filter((session) => session.expiresAt > now);
      db.sessions.push({ token, userId: user.id, createdAt: now, expiresAt: now + SESSION_TTL_MS });
      return sendJson(res, 200, { user: publicUser(user) }, { "Set-Cookie": sessionCookie(token) });
    });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = parseCookies(req).session;
    await updateDb((db) => {
      db.sessions = db.sessions.filter((session) => session.token !== token);
    });
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
  }

  if (url.pathname.startsWith("/api/notes")) {
    const user = await getCurrentUser(req);
    if (!user) return sendJson(res, 401, { error: "请先登录。" });

    if (req.method === "GET" && url.pathname === "/api/notes") {
      const db = await readDb();
      const notes = db.notes
        .filter((note) => note.userId === user.id)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .map(notePayload);
      return sendJson(res, 200, { notes });
    }

    if (req.method === "POST" && url.pathname === "/api/notes") {
      const body = await readBody(req);
      return updateDb((db) => {
        const now = new Date().toISOString();
        const title = String(body.title || "未命名笔记").trim().slice(0, 120) || "未命名笔记";
        const note = {
          id: randomId(),
          userId: user.id,
          title,
          content: String(body.content || ""),
          createdAt: now,
          updatedAt: now
        };
        db.notes.push(note);
        return sendJson(res, 201, { note: notePayload(note) });
      });
    }

    const match = url.pathname.match(/^\/api\/notes\/([a-f0-9]+)$/);
    if (!match) return sendJson(res, 404, { error: "接口不存在。" });
    const noteId = match[1];

    if (req.method === "GET") {
      const db = await readDb();
      const note = db.notes.find((item) => item.id === noteId && item.userId === user.id);
      if (!note) return sendJson(res, 404, { error: "笔记不存在。" });
      return sendJson(res, 200, { note: notePayload(note) });
    }

    if (req.method === "PATCH") {
      const body = await readBody(req);
      return updateDb((db) => {
        const note = db.notes.find((item) => item.id === noteId && item.userId === user.id);
        if (!note) return sendJson(res, 404, { error: "笔记不存在。" });
        if (body.title !== undefined) {
          note.title = String(body.title || "未命名笔记").trim().slice(0, 120) || "未命名笔记";
        }
        if (body.content !== undefined) {
          note.content = String(body.content || "");
        }
        note.updatedAt = new Date().toISOString();
        return sendJson(res, 200, { note: notePayload(note) });
      });
    }

    if (req.method === "DELETE") {
      return updateDb((db) => {
        const before = db.notes.length;
        db.notes = db.notes.filter((item) => !(item.id === noteId && item.userId === user.id));
        if (db.notes.length === before) return sendJson(res, 404, { error: "笔记不存在。" });
        return sendJson(res, 200, { ok: true });
      });
    }
  }

  return sendJson(res, 404, { error: "接口不存在。" });
}

async function serveStatic(req, res, url) {
  let requestedPath = decodeURIComponent(url.pathname);
  if (requestedPath === "/") requestedPath = "/index.html";
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return send(res, 403, "Forbidden");
  }
  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(file);
  } catch {
    const fallback = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache"
    });
    res.end(fallback);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url);
    }
    return await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    return sendJson(res, error.status || 500, { error: error.message || "服务器错误。" });
  }
});

ensureDb().then(() => {
  server.listen(PORT, () => {
    console.log(`E-Note is running at http://localhost:${PORT}`);
  });
});

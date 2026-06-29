var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// api-src/lessons-learned.ts
var lessons_learned_exports = {};
__export(lessons_learned_exports, {
  config: () => config,
  default: () => handler
});
module.exports = __toCommonJS(lessons_learned_exports);

// api-src/_lib/lessonsLearned.ts
var import_promises = require("node:fs/promises");
var import_node_path = __toESM(require("node:path"), 1);

// api-src/_lib/prisma.ts
var import_client = require("@prisma/client");
var globalForPrisma = globalThis;
var prisma = globalForPrisma.prisma ?? new import_client.PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
});
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

// api-src/_lib/lessonsLearned.ts
var DEV_STORE_PATH = import_node_path.default.join(process.cwd(), ".data", "lessons-learned.json");
var MAX_TEXT_CHARS = 8e3;
var devStoreCache = null;
var memoryStore = { lessons: [] };
function memoryStoreEnabled() {
  return process.env.LESSONS_MEMORY === "1";
}
var VALID_OUTCOMES = ["gewonnen", "verloren", "ingetrokken", "onbekend"];
function normalizeOutcome(value) {
  return VALID_OUTCOMES.includes(value) ? value : "onbekend";
}
function trimText(value, max = MAX_TEXT_CHARS) {
  const normalized = value.trim();
  return normalized.length > max ? `${normalized.slice(0, max).trim()}\u2026` : normalized;
}
function normalizeScore(value) {
  if (value === null || value === void 0 || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(100, Math.round(num)));
}
function mapRecord(record) {
  return {
    id: record.id,
    projectTitle: record.projectTitle,
    buyer: record.buyer,
    outcome: normalizeOutcome(record.outcome),
    score: record.score,
    category: record.category,
    situation: record.situation,
    lesson: record.lesson,
    recommendation: record.recommendation,
    sourceTenderId: record.sourceTenderId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}
async function readDevStore() {
  if (memoryStoreEnabled()) return memoryStore;
  if (devStoreCache) return devStoreCache;
  try {
    const raw = await (0, import_promises.readFile)(DEV_STORE_PATH, "utf8");
    devStoreCache = JSON.parse(raw);
    return devStoreCache;
  } catch {
    devStoreCache = { lessons: [] };
    return devStoreCache;
  }
}
async function writeDevStore(store) {
  if (memoryStoreEnabled()) {
    memoryStore = store;
    return;
  }
  devStoreCache = store;
  await (0, import_promises.mkdir)(import_node_path.default.dirname(DEV_STORE_PATH), { recursive: true });
  await (0, import_promises.writeFile)(DEV_STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}
function sanitizeInput(input) {
  const projectTitle = input.projectTitle?.trim();
  const lesson = input.lesson?.trim();
  if (!projectTitle) throw new Error("Projecttitel is verplicht.");
  if (!lesson) throw new Error("Het leerpunt mag niet leeg zijn.");
  const category = input.category?.trim();
  const buyer = input.buyer?.trim();
  return {
    projectTitle: trimText(projectTitle, 300),
    buyer: buyer ? trimText(buyer, 300) : null,
    outcome: normalizeOutcome(input.outcome),
    score: normalizeScore(input.score),
    category: category ? trimText(category, 120) : null,
    situation: trimText(input.situation ?? ""),
    lesson: trimText(lesson),
    recommendation: trimText(input.recommendation ?? ""),
    sourceTenderId: input.sourceTenderId?.trim() || null
  };
}
async function listLessons() {
  if (isDatabaseConfigured()) {
    const records = await prisma.lessonLearned.findMany({ orderBy: { createdAt: "desc" } });
    return records.map(mapRecord);
  }
  const store = await readDevStore();
  return [...store.lessons].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
async function createLesson(rawInput) {
  const input = sanitizeInput(rawInput);
  if (isDatabaseConfigured()) {
    const record = await prisma.lessonLearned.create({
      data: {
        projectTitle: input.projectTitle,
        buyer: input.buyer ?? null,
        outcome: input.outcome,
        score: input.score ?? null,
        category: input.category ?? null,
        situation: input.situation,
        lesson: input.lesson,
        recommendation: input.recommendation,
        sourceTenderId: input.sourceTenderId ?? null
      }
    });
    return mapRecord(record);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const lesson = {
    id: crypto.randomUUID(),
    projectTitle: input.projectTitle,
    buyer: input.buyer ?? null,
    outcome: input.outcome,
    score: input.score ?? null,
    category: input.category ?? null,
    situation: input.situation,
    lesson: input.lesson,
    recommendation: input.recommendation,
    sourceTenderId: input.sourceTenderId ?? null,
    createdAt: now,
    updatedAt: now
  };
  const store = await readDevStore();
  store.lessons.unshift(lesson);
  await writeDevStore(store);
  return lesson;
}
async function updateLesson(input) {
  if (!input.id?.trim()) throw new Error("Leerpunt-id ontbreekt.");
  const data = {
    ...input.projectTitle?.trim() ? { projectTitle: trimText(input.projectTitle, 300) } : {},
    ...input.buyer !== void 0 ? { buyer: input.buyer?.trim() ? trimText(input.buyer, 300) : null } : {},
    ...input.outcome ? { outcome: normalizeOutcome(input.outcome) } : {},
    ...input.score !== void 0 ? { score: normalizeScore(input.score) } : {},
    ...input.category !== void 0 ? { category: input.category?.trim() ? trimText(input.category, 120) : null } : {},
    ...input.situation !== void 0 ? { situation: trimText(input.situation) } : {},
    ...input.lesson?.trim() ? { lesson: trimText(input.lesson) } : {},
    ...input.recommendation !== void 0 ? { recommendation: trimText(input.recommendation) } : {}
  };
  if (isDatabaseConfigured()) {
    const existing = await prisma.lessonLearned.findUnique({ where: { id: input.id } });
    if (!existing) throw new Error("Leerpunt niet gevonden.");
    const record = await prisma.lessonLearned.update({ where: { id: input.id }, data });
    return mapRecord(record);
  }
  const store = await readDevStore();
  const index = store.lessons.findIndex((item) => item.id === input.id);
  if (index < 0) throw new Error("Leerpunt niet gevonden.");
  const updated = {
    ...store.lessons[index],
    ...data,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  store.lessons[index] = updated;
  await writeDevStore(store);
  return updated;
}
async function deleteLesson(id) {
  if (!id?.trim()) throw new Error("Leerpunt-id ontbreekt.");
  if (isDatabaseConfigured()) {
    await prisma.lessonLearned.delete({ where: { id } });
    return;
  }
  const store = await readDevStore();
  const next = store.lessons.filter((item) => item.id !== id);
  if (next.length === store.lessons.length) throw new Error("Leerpunt niet gevonden.");
  store.lessons = next;
  await writeDevStore(store);
}
async function handleLessonsLearnedRequest(request) {
  try {
    if (request.method === "GET") {
      const lessons = await listLessons();
      return Response.json({ lessons });
    }
    if (request.method === "POST") {
      const body = await request.json();
      const lesson = await createLesson(body);
      return Response.json({ lesson }, { status: 201 });
    }
    if (request.method === "PUT") {
      const body = await request.json();
      if (!body.id?.trim()) throw new Error("Leerpunt-id ontbreekt.");
      const lesson = await updateLesson(body);
      return Response.json({ lesson });
    }
    if (request.method === "DELETE") {
      const url = new URL(request.url);
      const id = url.searchParams.get("id");
      if (!id) throw new Error("Leerpunt-id ontbreekt.");
      await deleteLesson(id);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout bij lessons learned.";
    const status = message.includes("niet gevonden") ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}

// api-src/_lib/vercelHandler.ts
var import_consumers = require("node:stream/consumers");
function headersFromReq(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}
async function createRequestFromVercel(req) {
  const protocol = req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const host = req.headers.host ?? "localhost";
  const url = `${protocol}://${host}${req.url ?? ""}`;
  if (req.method === "GET" || req.method === "HEAD") {
    return new Request(url, { method: req.method, headers: headersFromReq(req) });
  }
  const rawBody = await (0, import_consumers.buffer)(req);
  return new Request(url, {
    method: req.method,
    headers: headersFromReq(req),
    body: rawBody.length ? rawBody : void 0
  });
}
async function sendWebResponse(res, response) {
  const body = await response.text();
  res.status(response.status);
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "content-encoding") return;
    res.setHeader(key, value);
  });
  res.send(body);
}

// api-src/lessons-learned.ts
var config = {
  maxDuration: 30
};
async function handler(req, res) {
  try {
    const request = await createRequestFromVercel(req);
    const response = await handleLessonsLearnedRequest(request);
    await sendWebResponse(res, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interne serverfout bij lessons learned.";
    res.status(500).json({ error: message });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  config
});

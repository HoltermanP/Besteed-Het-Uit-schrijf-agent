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

// api-src/insights.ts
var insights_exports = {};
__export(insights_exports, {
  config: () => config,
  default: () => handler
});
module.exports = __toCommonJS(insights_exports);

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

// api-src/_lib/aiClient.ts
var ANTHROPIC_VERSION = "2023-06-01";
var DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
var DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
function normalizeBaseUrl(value, fallback) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return fallback;
  return trimmed;
}
function normalizeAnthropicBaseUrl(baseUrl) {
  return normalizeBaseUrl(baseUrl, DEFAULT_ANTHROPIC_BASE_URL).replace(/\/$/, "").replace(/\/v1$/, "");
}
function usesAdaptiveThinking(model) {
  return /claude-(opus-4-[678]|sonnet-4-6|fable-5|mythos-5)/i.test(model);
}
function splitMessages(messages) {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const chatMessages = messages.filter((message) => message.role !== "system").map((message) => ({
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content
  }));
  return { system, chatMessages };
}
async function completeAnthropic(ai, messages, options) {
  const { system, chatMessages } = splitMessages(messages);
  const body = {
    model: ai.model,
    max_tokens: options.maxTokens ?? 16e3,
    messages: chatMessages
  };
  if (system) body.system = system;
  if (options.useThinking && usesAdaptiveThinking(ai.model)) {
    body.thinking = { type: "adaptive" };
    body.output_config = { effort: options.effort ?? "high" };
  }
  const baseUrl = normalizeAnthropicBaseUrl(normalizeBaseUrl(ai.baseUrl, DEFAULT_ANTHROPIC_BASE_URL));
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": ai.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 12e4)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Anthropic API mislukt (${response.status}): ${detail.slice(0, 280)}`);
  }
  const payload = await response.json();
  const text = payload.content?.filter((block) => block.type === "text").map((block) => block.text ?? "").join("").trim();
  if (!text) throw new Error("Anthropic gaf geen tekst terug.");
  return text;
}
async function completeOpenAiCompatible(ai, messages, options) {
  const baseUrl = normalizeBaseUrl(ai.baseUrl, DEFAULT_OPENAI_BASE_URL).replace(/\/$/, "");
  const body = {
    model: ai.model,
    temperature: 0.2,
    messages,
    max_tokens: options.maxTokens ?? 16e3
  };
  if (options.jsonMode) {
    body.response_format = { type: "json_object" };
  }
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ai.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 12e4)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI API mislukt (${response.status}): ${detail.slice(0, 280)}`);
  }
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("AI gaf geen resultaat terug.");
  return content;
}
async function completeChat(ai, messages, options = {}) {
  if (ai.provider === "anthropic") {
    return completeAnthropic(ai, messages, options);
  }
  return completeOpenAiCompatible(ai, messages, options);
}
function resolveAnthropicFromEnv(modelEnv = "WRITER_MODEL") {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    provider: "anthropic",
    baseUrl: normalizeBaseUrl(process.env.ANTHROPIC_BASE_URL, DEFAULT_ANTHROPIC_BASE_URL),
    apiKey,
    model: process.env[modelEnv]?.trim() || "claude-opus-4-8"
  };
}
function resolveOpenAiFromEnv(modelEnv = "OPENAI_MODEL") {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    provider: "openai",
    baseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL, DEFAULT_OPENAI_BASE_URL),
    apiKey,
    model: process.env[modelEnv]?.trim() || "gpt-4.1-mini"
  };
}
function resolveAiFromRequest(requestAi, envModelKey = "WRITER_MODEL") {
  if (requestAi?.apiKey?.trim()) {
    const defaults = requestAi.provider === "anthropic" ? { baseUrl: DEFAULT_ANTHROPIC_BASE_URL, model: "claude-opus-4-8" } : { baseUrl: DEFAULT_OPENAI_BASE_URL, model: "gpt-4.1-mini" };
    return {
      provider: requestAi.provider,
      baseUrl: normalizeBaseUrl(requestAi.baseUrl, defaults.baseUrl),
      apiKey: requestAi.apiKey.trim(),
      model: requestAi.model?.trim() || defaults.model
    };
  }
  const anthropic = resolveAnthropicFromEnv(envModelKey);
  if (anthropic) return anthropic;
  const openai = resolveOpenAiFromEnv(envModelKey);
  if (openai) return openai;
  throw new Error(
    "Geen AI-configuratie beschikbaar. Stel de schrijfagent in via API-beheer of zet ANTHROPIC_API_KEY in de serveromgeving."
  );
}

// api-src/_lib/evaluateProject.ts
var DRAFT_CHAR_LIMIT = 3e4;
var REFLECTION_CHAR_LIMIT = 8e3;
var MAX_LESSONS = 8;
var outcomeLabels = {
  gewonnen: "Gewonnen",
  verloren: "Verloren",
  ingetrokken: "Ingetrokken / niet ingediend",
  onbekend: "Uitkomst onbekend"
};
var SYSTEM_PROMPT = `Je bent een senior bid-evaluator voor Nederlandse aanbestedingen (Aanbestedingswet, EMVI, BPKV).
Je destilleert uit een afgerond project concrete, herbruikbare leerpunten ("lessons learned") die de winkans bij vergelijkbare toekomstige aanbestedingen vergroten.

DOEL
Lever scherpe, overdraagbare leerpunten \u2014 geen samenvatting van het project. Elk leerpunt moet bij een v\xF3lgend project bruikbaar zijn als richtlijn.

WAAR JE OP LET
- Wat werkte aantoonbaar (en is herhaalbaar) en wat kostte punten (en moet anders)?
- Bewijsvoering, dekking van beoordelingscriteria, prijsstrategie, vorm-/indieningseisen, planning en bewijslast.
- Feedback van de opdrachtgever uit de reflectie weegt zwaar.
- Vertaal incidentele observaties naar een algemeen toepasbare les.

REGELS
- Baseer je uitsluitend op het aangeleverde concept, de analyse, de uitkomst en de reflectie. Verzin geen feiten.
- Formuleer elk leerpunt generiek genoeg om bij andere aanbestedingen toe te passen, maar concreet genoeg om naar te handelen.
- Geef per leerpunt een "category" (kort thema, bijv. "prijs", "social return", "bewijslast", "vormeisen", "planning"), een "situation" (wat speelde er), een "lesson" (het leerpunt) en een "recommendation" (hoe het volgende keer toe te passen).
- Maximaal ${MAX_LESSONS} leerpunten, gerangschikt op impact (belangrijkste eerst).
- Schrijf in het Nederlands.

Antwoord uitsluitend met geldig JSON in exact deze vorm:
{
  "lessons": [
    { "category": "", "situation": "", "lesson": "", "recommendation": "" }
  ]
}`;
function draftToPlainText(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, DRAFT_CHAR_LIMIT);
}
function formatAnalysis(analysis) {
  if (!analysis) return "Geen leidraadanalyse beschikbaar.";
  const lines = [`- Samenvatting: ${analysis.summary}`];
  if ((analysis.evaluationCriteria ?? []).length) {
    lines.push("- Beoordelingscriteria:");
    analysis.evaluationCriteria.forEach((criterion) => lines.push(`  \u2022 ${criterion}`));
  }
  if (analysis.underlyingIntent) {
    lines.push(`- Vraag achter de vraag: ${analysis.underlyingIntent.questionBehindQuestion}`);
  }
  return lines.join("\n");
}
function buildUserPrompt(request) {
  return `Project:
- Titel: ${request.project.title}
- Opdrachtgever: ${request.project.buyer}
- Deadline: ${request.project.deadline}
- TenderNed: ${request.project.tendernedId}
- Uitkomst: ${outcomeLabels[request.outcome] ?? request.outcome}

Leidraadanalyse:
${formatAnalysis(request.analysis)}

Reflectie van het team (wat ging goed/fout, feedback opdrachtgever, opmerkingen):
${request.reflection?.trim().slice(0, REFLECTION_CHAR_LIMIT) || "- (geen reflectie aangeleverd)"}

=== INGEDIEND CONCEPT (platte tekst) ===
${draftToPlainText(request.draft) || "(geen concept beschikbaar)"}

Lever de leerpunten als JSON.`;
}
function parseLessons(content) {
  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.lessons)) return [];
  return parsed.lessons.map((raw) => {
    if (!raw || typeof raw !== "object") return null;
    const item = raw;
    const lesson = typeof item.lesson === "string" ? item.lesson.trim() : "";
    if (!lesson) return null;
    return {
      category: typeof item.category === "string" ? item.category.trim() : "",
      situation: typeof item.situation === "string" ? item.situation.trim() : "",
      lesson,
      recommendation: typeof item.recommendation === "string" ? item.recommendation.trim() : ""
    };
  }).filter((item) => item !== null).slice(0, MAX_LESSONS);
}
async function handleEvaluateProjectRequest(request) {
  if (!request.draft?.trim() && !request.reflection?.trim()) {
    return Response.json(
      { error: "Geen concept of reflectie aangeleverd om uit te evalueren." },
      { status: 400 }
    );
  }
  let ai;
  try {
    ai = resolveAiFromRequest(request.ai, "REVIEW_MODEL");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Geen AI-configuratie beschikbaar voor evaluatie.";
    return Response.json({ error: message }, { status: 400 });
  }
  try {
    const content = await completeChat(
      ai,
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(request) }
      ],
      { jsonMode: ai.provider !== "anthropic", maxTokens: 4e3, timeoutMs: 12e4, useThinking: false }
    );
    const lessons = parseLessons(content);
    return Response.json({
      lessons,
      provider: ai.provider,
      model: ai.model
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI-evaluatie van het project is mislukt.";
    return Response.json({ error: message }, { status: 502 });
  }
}

// api-src/_lib/selectLessons.ts
var MAX_CANDIDATES = 60;
var MAX_SELECTED = 8;
var CANDIDATE_CHAR_LIMIT = 600;
var SUMMARY_CHAR_LIMIT = 6e3;
var SYSTEM_PROMPT2 = `Je bent een bid-strateeg voor Nederlandse aanbestedingen.
Je krijgt een nieuwe aanbesteding en een lijst eerder vastgelegde leerpunten ("lessons learned") uit afgeronde projecten.
Kies de leerpunten die aantoonbaar relevant zijn voor d\xE9ze nieuwe aanbesteding en die de winkans kunnen vergroten.

REGELS
- Kies alleen leerpunten die echt van toepassing zijn op de inhoud, opdrachtgever, branche of beoordelingscriteria van deze aanbesteding. Liever streng dan ruim.
- Negeer leerpunten die niet passen; het is prima om er weinig of geen te kiezen.
- Maximaal ${MAX_SELECTED} leerpunten, belangrijkste eerst.
- Geef per gekozen leerpunt een korte reden waarom het hier relevant is.
- Gebruik uitsluitend de "id"-waarden uit de aangeleverde lijst.

Antwoord uitsluitend met geldig JSON in exact deze vorm:
{
  "selected": [
    { "id": "", "reason": "" }
  ]
}`;
function formatAnalysis2(analysis, fallback) {
  if (analysis) {
    const lines = [`- Samenvatting: ${analysis.summary}`];
    const mandatory = (analysis.contentRequirements ?? []).filter((req) => req.mandatory);
    if (mandatory.length) {
      lines.push("- Verplichte onderwerpen:");
      mandatory.slice(0, 12).forEach((req) => lines.push(`  \u2022 ${req.topic}`));
    }
    if ((analysis.evaluationCriteria ?? []).length) {
      lines.push("- Beoordelingscriteria:");
      analysis.evaluationCriteria.slice(0, 12).forEach((c) => lines.push(`  \u2022 ${c}`));
    }
    return lines.join("\n");
  }
  if (fallback?.trim()) {
    return `- Aanbestedingssamenvatting:
${fallback.trim().slice(0, SUMMARY_CHAR_LIMIT)}`;
  }
  return "Geen analyse of samenvatting beschikbaar.";
}
function formatCandidates(request) {
  return request.candidates.slice(0, MAX_CANDIDATES).map((c) => {
    const meta = [c.category, c.buyer, c.outcome].filter(Boolean).join(" \xB7 ");
    const body = `${c.lesson} \u2014 Toepassing: ${c.recommendation}`.slice(0, CANDIDATE_CHAR_LIMIT);
    return `- id: ${c.id}${meta ? ` [${meta}]` : ""}
  ${body}`;
  }).join("\n");
}
function parseSelected(content, validIds) {
  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.selected)) return [];
  const seen = /* @__PURE__ */ new Set();
  return parsed.selected.map((raw) => {
    if (!raw || typeof raw !== "object") return null;
    const item = raw;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id || !validIds.has(id) || seen.has(id)) return null;
    seen.add(id);
    return { id, reason: typeof item.reason === "string" ? item.reason.trim() : "" };
  }).filter((item) => item !== null).slice(0, MAX_SELECTED);
}
async function handleSelectLessonsRequest(request) {
  const candidates = Array.isArray(request.candidates) ? request.candidates : [];
  if (!candidates.length) {
    return Response.json({ selected: [], provider: "geen", model: "geen" });
  }
  let ai;
  try {
    ai = resolveAiFromRequest(request.ai, "REVIEW_MODEL");
  } catch {
    return Response.json({
      selected: candidates.slice(0, MAX_SELECTED).map((c) => ({ id: c.id, reason: "" })),
      provider: "heuristiek",
      model: "lokaal"
    });
  }
  try {
    const validIds = new Set(candidates.map((c) => c.id));
    const content = await completeChat(
      ai,
      [
        { role: "system", content: SYSTEM_PROMPT2 },
        {
          role: "user",
          content: `Nieuwe aanbesteding:
- Titel: ${request.project.title}
- Opdrachtgever: ${request.project.buyer}

${formatAnalysis2(request.analysis, request.tenderSummary)}

=== BESCHIKBARE LEERPUNTEN ===
${formatCandidates(request)}

Lever je selectie als JSON.`
        }
      ],
      { jsonMode: ai.provider !== "anthropic", maxTokens: 2e3, timeoutMs: 9e4, useThinking: false }
    );
    return Response.json({
      selected: parseSelected(content, validIds),
      provider: ai.provider,
      model: ai.model
    });
  } catch {
    return Response.json({
      selected: candidates.slice(0, MAX_SELECTED).map((c) => ({ id: c.id, reason: "" })),
      provider: "heuristiek",
      model: "lokaal"
    });
  }
}

// api-src/_lib/compareProjects.ts
var EXCERPT_CHAR_LIMIT = 8e3;
var MAX_PROJECTS = 4;
var MAX_LESSONS2 = 6;
var SYSTEM_PROMPT3 = `Je bent een senior bid-strateeg voor Nederlandse aanbestedingen (Aanbestedingswet, EMVI, BPKV).
Je vergelijkt hoe een inschrijver meerdere projecten in het verleden heeft aangepakt en maakt de aanpak-keuzes expliciet.

DOEL
Help de inschrijver leren van zijn eigen historie: laat zien wat de aanpakken gemeen hadden, waarin ze verschilden, welke patronen opvallen en welke herbruikbare leerpunten dit oplevert voor toekomstige aanbestedingen.

WAAR JE OP LET
- Opbouw en structuur van het plan van aanpak (volgorde, koppen, lengte).
- Dekking van de beoordelingscriteria en de bewijsvoering.
- Welke bronnen zijn ingezet en hoe zwaar.
- Toon, concreetheid en onderbouwing.
- Verschillen die plausibel de winkans be\xEFnvloeden.

REGELS
- Baseer je uitsluitend op de aangeleverde projectgegevens. Verzin geen feiten en geen uitkomsten die er niet staan.
- Wees concreet en vergelijkend: benoem per verschil hoe de projecten van elkaar afweken.
- Leerpunten moeten generiek genoeg zijn voor een volgend project, maar concreet genoeg om naar te handelen.
- Geef per leerpunt een "category" (kort thema), "situation" (wat speelde er, met verwijzing naar de projecten), "lesson" (het leerpunt) en "recommendation" (hoe toe te passen).
- Maximaal ${MAX_LESSONS2} leerpunten, belangrijkste eerst. Schrijf in het Nederlands.

Antwoord uitsluitend met geldig JSON in exact deze vorm:
{
  "overview": "",
  "similarities": [""],
  "differences": [{ "aspect": "", "observation": "" }],
  "insights": [""],
  "lessons": [{ "category": "", "situation": "", "lesson": "", "recommendation": "" }]
}`;
function formatProject(project, index) {
  const evaluationCriteria = Array.isArray(project.evaluationCriteria) ? project.evaluationCriteria : [];
  const headings = Array.isArray(project.headings) ? project.headings : [];
  const lines = [
    `### Project ${index + 1}: ${project.title || "Naamloos project"}`,
    `- Opdrachtgever: ${project.buyer || "\u2014"}`,
    `- Deadline: ${project.deadline || "\u2014"}`,
    `- Fase: ${project.stage || "\u2014"}`,
    `- Woorden in concept: ${project.wordCount ?? 0}`,
    `- Gebruikte bronnen: ${project.documentOverview || "\u2014"}`
  ];
  if (project.analysisSummary) {
    lines.push(`- Leidraadanalyse: ${project.analysisSummary}`);
  }
  if (evaluationCriteria.length) {
    lines.push(`- Beoordelingscriteria: ${evaluationCriteria.join("; ")}`);
  }
  if (headings.length) {
    lines.push(`- Opbouw concept (koppen): ${headings.join(" \u203A ")}`);
  }
  lines.push(
    `- Fragment concept (platte tekst): ${(project.draftExcerpt ?? "").slice(0, EXCERPT_CHAR_LIMIT) || "(geen concept beschikbaar)"}`
  );
  return lines.join("\n");
}
function buildUserPrompt2(projects) {
  return `Vergelijk de aanpak van de volgende ${projects.length} projecten.

${projects.map(formatProject).join("\n\n")}

Lever de vergelijking als JSON.`;
}
function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? item.trim() : "").filter((item) => item.length > 0);
}
function parseDifferences(value) {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    if (!raw || typeof raw !== "object") return null;
    const item = raw;
    const observation = typeof item.observation === "string" ? item.observation.trim() : "";
    if (!observation) return null;
    return {
      aspect: typeof item.aspect === "string" ? item.aspect.trim() : "",
      observation
    };
  }).filter((item) => item !== null);
}
function parseLessons2(value) {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    if (!raw || typeof raw !== "object") return null;
    const item = raw;
    const lesson = typeof item.lesson === "string" ? item.lesson.trim() : "";
    if (!lesson) return null;
    return {
      category: typeof item.category === "string" ? item.category.trim() : "",
      situation: typeof item.situation === "string" ? item.situation.trim() : "",
      lesson,
      recommendation: typeof item.recommendation === "string" ? item.recommendation.trim() : ""
    };
  }).filter((item) => item !== null).slice(0, MAX_LESSONS2);
}
function parseComparison(content) {
  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { overview: "", similarities: [], differences: [], insights: [], lessons: [] };
  }
  return {
    overview: typeof parsed.overview === "string" ? parsed.overview.trim() : "",
    similarities: asStringArray(parsed.similarities),
    differences: parseDifferences(parsed.differences),
    insights: asStringArray(parsed.insights),
    lessons: parseLessons2(parsed.lessons)
  };
}
async function handleCompareProjectsRequest(request) {
  const projects = Array.isArray(request.projects) ? request.projects.slice(0, MAX_PROJECTS) : [];
  if (projects.length < 2) {
    return Response.json(
      { error: "Selecteer minstens twee projecten om te vergelijken." },
      { status: 400 }
    );
  }
  let ai;
  try {
    ai = resolveAiFromRequest(request.ai, "REVIEW_MODEL");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Geen AI-configuratie beschikbaar voor vergelijking.";
    return Response.json({ error: message }, { status: 400 });
  }
  try {
    const content = await completeChat(
      ai,
      [
        { role: "system", content: SYSTEM_PROMPT3 },
        { role: "user", content: buildUserPrompt2(projects) }
      ],
      { jsonMode: ai.provider !== "anthropic", maxTokens: 4e3, timeoutMs: 12e4, useThinking: false }
    );
    const comparison = parseComparison(content);
    return Response.json({
      ...comparison,
      provider: ai.provider,
      model: ai.model
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI-vergelijking van de projecten is mislukt.";
    return Response.json({ error: message }, { status: 502 });
  }
}

// api-src/_lib/vercelHandler.ts
var import_consumers = require("node:stream/consumers");
function parseJsonBody(body) {
  if (body === void 0 || body === null) return {};
  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) return {};
    return JSON.parse(trimmed);
  }
  return body;
}
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

// api-src/insights.ts
var config = {
  maxDuration: 120
};
function readAction(req) {
  const value = req.query.action;
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}
async function handler(req, res) {
  const action = readAction(req);
  try {
    if (action === "evaluate" || action === "select" || action === "compare") {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }
      const body = parseJsonBody(req.body);
      let response2;
      if (action === "evaluate") {
        response2 = await handleEvaluateProjectRequest(body);
      } else if (action === "select") {
        response2 = await handleSelectLessonsRequest(body);
      } else {
        response2 = await handleCompareProjectsRequest(body);
      }
      await sendWebResponse(res, response2);
      return;
    }
    const request = await createRequestFromVercel(req);
    const response = await handleLessonsLearnedRequest(request);
    await sendWebResponse(res, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interne serverfout bij insights.";
    res.status(500).json({ error: message });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  config
});

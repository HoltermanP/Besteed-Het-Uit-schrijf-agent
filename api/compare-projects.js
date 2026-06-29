var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// api-src/compare-projects.ts
var compare_projects_exports = {};
__export(compare_projects_exports, {
  config: () => config,
  default: () => handler
});
module.exports = __toCommonJS(compare_projects_exports);

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

// api-src/_lib/compareProjects.ts
var EXCERPT_CHAR_LIMIT = 8e3;
var MAX_PROJECTS = 4;
var MAX_LESSONS = 6;
var SYSTEM_PROMPT = `Je bent een senior bid-strateeg voor Nederlandse aanbestedingen (Aanbestedingswet, EMVI, BPKV).
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
- Maximaal ${MAX_LESSONS} leerpunten, belangrijkste eerst. Schrijf in het Nederlands.

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
function buildUserPrompt(projects) {
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
function parseLessons(value) {
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
  }).filter((item) => item !== null).slice(0, MAX_LESSONS);
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
    lessons: parseLessons(parsed.lessons)
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
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(projects) }
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
function parseJsonBody(body) {
  if (body === void 0 || body === null) return {};
  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) return {};
    return JSON.parse(trimmed);
  }
  return body;
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

// api-src/compare-projects.ts
var config = {
  maxDuration: 120
};
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const body = parseJsonBody(req.body);
    const response = await handleCompareProjectsRequest(body);
    await sendWebResponse(res, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interne serverfout bij projectvergelijking.";
    res.status(500).json({ error: message });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  config
});

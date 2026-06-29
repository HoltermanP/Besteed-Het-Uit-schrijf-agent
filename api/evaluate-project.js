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

// api-src/evaluate-project.ts
var evaluate_project_exports = {};
__export(evaluate_project_exports, {
  config: () => config,
  default: () => handler
});
module.exports = __toCommonJS(evaluate_project_exports);

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

// api-src/evaluate-project.ts
var config = {
  maxDuration: 120
};
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const body = parseJsonBody(req.body);
    const response = await handleEvaluateProjectRequest(body);
    await sendWebResponse(res, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interne serverfout bij projectevaluatie.";
    res.status(500).json({ error: message });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  config
});

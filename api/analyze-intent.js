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

// api-src/analyze-intent.ts
var analyze_intent_exports = {};
__export(analyze_intent_exports, {
  config: () => config,
  default: () => handler
});
module.exports = __toCommonJS(analyze_intent_exports);

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

// api-src/_lib/analyzeIntent.ts
var DOC_CHAR_LIMIT = 18e3;
function trimSource(text, max = DOC_CHAR_LIMIT) {
  const cleaned = text.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max)}\u2026`;
}
function formatDocuments(request) {
  return request.documents.map((doc) => `- [${doc.type}] ${doc.name}:
${trimSource(doc.content)}`).join("\n\n");
}
var SYSTEM_PROMPT = `Je bent een senior bid-analist voor Nederlandse aanbestedingen.
Doel: achterhalen wat de opdrachtgever ECHT wil \u2014 de "vraag achter de vraag" \u2014 naast de expliciete leidraadeisen.

Regels:
- Baseer je op de bronnen; verzin geen feiten over de opdrachtgever of opdracht.
- Onderscheid expliciete vraag (formulieren, onderwerpen, bijlagen) vs onderliggende behoefte (zekerheid, grip, risico, EMVI-prioriteit).
- Schrijf in het Nederlands, concreet en bruikbaar voor een bidwriter.
- teamBrief is een intern reflectiestuk voor het inschrijver-team (niet voor indiening bij de opdrachtgever).
- buyerPriorities: max 5 items, geordend op belang.
- implicitSuccessFactors: max 5 items, wat impliciet succesvol maakt.

Antwoord uitsluitend met geldig JSON:
{
  "explicitQuestion": "",
  "underlyingNeed": "",
  "questionBehindQuestion": "",
  "buyerPriorities": [],
  "implicitSuccessFactors": [],
  "writingGuidance": "",
  "teamBrief": ""
}`;
function parseIntentJson(content, baseline) {
  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return baseline;
  }
  const teamBrief = parsed.teamBrief?.trim() || baseline.teamBrief;
  return {
    explicitQuestion: parsed.explicitQuestion?.trim() || baseline.explicitQuestion,
    underlyingNeed: parsed.underlyingNeed?.trim() || baseline.underlyingNeed,
    questionBehindQuestion: parsed.questionBehindQuestion?.trim() || baseline.questionBehindQuestion,
    buyerPriorities: parsed.buyerPriorities?.filter(Boolean).slice(0, 5) ?? baseline.buyerPriorities,
    implicitSuccessFactors: parsed.implicitSuccessFactors?.filter(Boolean).slice(0, 5) ?? baseline.implicitSuccessFactors,
    writingGuidance: parsed.writingGuidance?.trim() || baseline.writingGuidance,
    teamBrief
  };
}
async function handleAnalyzeIntentRequest(request) {
  if (!request.buyerName?.trim()) {
    return Response.json({ error: "Opdrachtgever ontbreekt." }, { status: 400 });
  }
  if (!request.documents?.length) {
    return Response.json({ error: "Geen bronnen om te analyseren." }, { status: 400 });
  }
  if (!request.baseline) {
    return Response.json({ error: "Baseline-analyse ontbreekt." }, { status: 400 });
  }
  let ai;
  try {
    ai = resolveAiFromRequest(request.ai, "INTENT_MODEL");
  } catch {
    return Response.json({
      underlyingIntent: request.baseline,
      provider: "heuristiek",
      model: "lokaal",
      enriched: false
    });
  }
  const userContent = `Opdrachtgever: ${request.buyerName}

Heuristische baseline (verbeter/verfijn waar de bronnen dat rechtvaardigen):
${JSON.stringify(request.baseline, null, 2)}

Bronnen:
${formatDocuments(request)}

Lever een scherpere vraag-achter-de-vraag analyse. teamBrief moet beginnen met "Intern \u2014 niet opnemen in het inschrijfdocument".`;
  const content = await completeChat(
    ai,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent }
    ],
    { jsonMode: ai.provider !== "anthropic", maxTokens: 4e3, timeoutMs: 9e4, useThinking: false }
  );
  const underlyingIntent = parseIntentJson(content, request.baseline);
  return Response.json({
    underlyingIntent,
    provider: ai.provider,
    model: ai.model,
    enriched: true
  });
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

// api-src/analyze-intent.ts
var config = {
  maxDuration: 120
};
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const response = await handleAnalyzeIntentRequest(parseJsonBody(req.body));
    await sendWebResponse(res, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interne serverfout bij intent-analyse.";
    res.status(500).json({ error: message });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  config
});

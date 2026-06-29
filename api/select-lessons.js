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

// api-src/select-lessons.ts
var select_lessons_exports = {};
__export(select_lessons_exports, {
  config: () => config,
  default: () => handler
});
module.exports = __toCommonJS(select_lessons_exports);

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

// api-src/_lib/selectLessons.ts
var MAX_CANDIDATES = 60;
var MAX_SELECTED = 8;
var CANDIDATE_CHAR_LIMIT = 600;
var SUMMARY_CHAR_LIMIT = 6e3;
var SYSTEM_PROMPT = `Je bent een bid-strateeg voor Nederlandse aanbestedingen.
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
function formatAnalysis(analysis, fallback) {
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
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Nieuwe aanbesteding:
- Titel: ${request.project.title}
- Opdrachtgever: ${request.project.buyer}

${formatAnalysis(request.analysis, request.tenderSummary)}

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

// api-src/select-lessons.ts
var config = {
  maxDuration: 90
};
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const body = parseJsonBody(req.body);
    const response = await handleSelectLessonsRequest(body);
    await sendWebResponse(res, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interne serverfout bij leerpunt-selectie.";
    res.status(500).json({ error: message });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  config
});

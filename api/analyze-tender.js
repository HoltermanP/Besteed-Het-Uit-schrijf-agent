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

// api-src/analyze-tender.ts
var analyze_tender_exports = {};
__export(analyze_tender_exports, {
  config: () => config,
  default: () => handler
});
module.exports = __toCommonJS(analyze_tender_exports);

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

// api-src/_lib/analyzeTender.ts
var DOC_CHAR_LIMIT = 22e3;
function trimSource(text, max = DOC_CHAR_LIMIT) {
  const cleaned = text.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max)}\u2026`;
}
function formatDocuments(request) {
  return request.documents.map((doc) => `- [${doc.type}] ${doc.name}:
${trimSource(doc.content)}`).join("\n\n");
}
var SYSTEM_PROMPT = `Je bent een senior bid-analist voor Nederlandse aanbestedingen (Aanbestedingswet, EMVI/BPKV).
Doel: de uitvraag scherp en volledig analyseren zodat de bidwriter al vanaf de eerste (bronzen) versie gericht schrijft.

Analyseer de aanbestedingsstukken (vooral de leidraad) en bepaal concreet:
- welke documenten/bijlagen moeten worden ingediend (documentRequirements)
- welke woord-, karakter- of paginalimieten gelden (wordLimits) en wat het bindende maximum is (targetWordCount/targetCharCount)
- welke vragen/onderwerpen inhoudelijk beantwoord moeten worden (contentRequirements)
- de beoordelingscriteria met gewichten (evaluationCriteria)
- de "vraag achter de vraag": wat wil de opdrachtgever ECHT (underlyingIntent)
- welke schrijfstijl past (styleProfile: stem inschrijver \xD7 verwachtingen opdrachtgever)
- specifieke EISEN AAN DE INSCHRIJVING ZELF (submissionRequirements): vormvereisten (PDF, anonimisering, taal), opmaak (lettertype, marges, A4), indiening (deadline, kanaal/TenderNed, rechtsgeldige ondertekening), geschiktheidseisen, uitsluitingsgronden, proceseisen (Nota van Inlichtingen)

Regels:
- Baseer je UITSLUITEND op de bronnen; verzin geen feiten, limieten of eisen.
- Verbeter en verrijk de meegegeven heuristische baseline; verwijder velden niet zonder reden.
- targetWordCount/targetCharCount = het STRIKTE bindende maximum voor het hoofd-inschrijfstuk (kies het strafste relevante maximum). Laat weg (null) als er geen maximum is.
- submissionRequirements.category \u2208 {"vorm","opmaak","indiening","geschiktheid","uitsluiting","proces","overig"}.
- mandatory = true alleen als de bron het verplicht stelt (verplicht/dient/moet/op straffe van uitsluiting).
- source = de bestandsnaam waaruit de eis komt.
- teamBrief is intern (niet voor indiening) en begint met "Intern \u2014 niet opnemen in het inschrijfdocument".
- gaps: ontbrekende of risicovolle punten waarop het team moet letten.
- Schrijf in het Nederlands, concreet en toetsbaar.

Antwoord UITSLUITEND met geldig JSON in exact deze vorm:
{
  "summary": "",
  "wordLimits": [{ "label": "", "section": "", "min": null, "max": null, "unit": "woorden|karakters|paginas", "source": "" }],
  "contentRequirements": [{ "topic": "", "detail": "", "mandatory": true, "source": "" }],
  "documentRequirements": [{ "name": "", "mandatory": true, "source": "" }],
  "submissionRequirements": [{ "category": "vorm", "requirement": "", "mandatory": true, "source": "" }],
  "evaluationCriteria": ["Criterium (gewicht%)"],
  "styleProfile": { "companyName": "", "buyerName": "", "companySignals": [], "buyerSignals": [], "blendedGuidance": "" },
  "underlyingIntent": { "explicitQuestion": "", "underlyingNeed": "", "questionBehindQuestion": "", "buyerPriorities": [], "implicitSuccessFactors": [], "writingGuidance": "", "teamBrief": "" },
  "gaps": [],
  "targetWordCount": null,
  "targetCharCount": null
}`;
function asArray(value) {
  return Array.isArray(value) ? value : [];
}
function str(value) {
  return typeof value === "string" ? value.trim() : "";
}
function posInt(value) {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : void 0;
}
var SUBMISSION_CATEGORIES = ["vorm", "opmaak", "indiening", "geschiktheid", "uitsluiting", "proces", "overig"];
function normalizeWordLimits(value, fallback) {
  const parsed = asArray(value).map((item) => {
    const unit = str(item.unit);
    const normalizedUnit = unit === "karakters" || unit === "paginas" ? unit : "woorden";
    const label = str(item.label) || "Limiet";
    const min = posInt(item.min);
    const max = posInt(item.max);
    if (min === void 0 && max === void 0) return null;
    return {
      label,
      section: str(item.section) || void 0,
      min,
      max,
      unit: normalizedUnit,
      source: str(item.source) || "leidraad"
    };
  }).filter((item) => item !== null);
  return parsed.length ? parsed : fallback;
}
function normalizeContentRequirements(value, fallback) {
  const parsed = asArray(value).map((item) => {
    const topic = str(item.topic);
    if (!topic) return null;
    return {
      topic,
      detail: str(item.detail) || topic,
      mandatory: item.mandatory !== false,
      source: str(item.source) || "leidraad"
    };
  }).filter((item) => item !== null);
  return parsed.length ? parsed : fallback;
}
function normalizeDocumentRequirements(value, fallback) {
  const parsed = asArray(value).map((item) => {
    const name = str(item.name);
    if (!name) return null;
    return { name, mandatory: item.mandatory !== false, source: str(item.source) || "leidraad" };
  }).filter((item) => item !== null);
  return parsed.length ? parsed : fallback;
}
function normalizeSubmissionRequirements(value, fallback) {
  const parsed = asArray(value).map((item) => {
    const requirement = str(item.requirement);
    if (!requirement) return null;
    const category = str(item.category);
    return {
      category: SUBMISSION_CATEGORIES.includes(category) ? category : "overig",
      requirement,
      mandatory: item.mandatory !== false,
      source: str(item.source) || "leidraad"
    };
  }).filter((item) => item !== null);
  return parsed.length ? parsed : fallback;
}
function normalizeStringList(value, fallback) {
  const parsed = asArray(value).map((item) => str(item)).filter(Boolean);
  return parsed.length ? parsed : fallback;
}
function mergeStyleProfile(value, fallback) {
  const item = value ?? {};
  return {
    companyName: str(item.companyName) || fallback.companyName,
    buyerName: str(item.buyerName) || fallback.buyerName,
    companySignals: normalizeStringList(item.companySignals, fallback.companySignals).slice(0, 6),
    buyerSignals: normalizeStringList(item.buyerSignals, fallback.buyerSignals).slice(0, 6),
    blendedGuidance: str(item.blendedGuidance) || fallback.blendedGuidance
  };
}
function mergeUnderlyingIntent(value, fallback) {
  if (!value || typeof value !== "object") return fallback;
  const item = value;
  const base = fallback ?? {
    explicitQuestion: "",
    underlyingNeed: "",
    questionBehindQuestion: "",
    buyerPriorities: [],
    implicitSuccessFactors: [],
    writingGuidance: "",
    teamBrief: ""
  };
  return {
    explicitQuestion: str(item.explicitQuestion) || base.explicitQuestion,
    underlyingNeed: str(item.underlyingNeed) || base.underlyingNeed,
    questionBehindQuestion: str(item.questionBehindQuestion) || base.questionBehindQuestion,
    buyerPriorities: normalizeStringList(item.buyerPriorities, base.buyerPriorities).slice(0, 5),
    implicitSuccessFactors: normalizeStringList(item.implicitSuccessFactors, base.implicitSuccessFactors).slice(0, 5),
    writingGuidance: str(item.writingGuidance) || base.writingGuidance,
    teamBrief: str(item.teamBrief) || base.teamBrief
  };
}
function parseAnalysisJson(content, baseline) {
  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return baseline;
  }
  const gaps = [.../* @__PURE__ */ new Set([...normalizeStringList(parsed.gaps, []), ...baseline.gaps])];
  return {
    ...baseline,
    summary: str(parsed.summary) || baseline.summary,
    wordLimits: normalizeWordLimits(parsed.wordLimits, baseline.wordLimits),
    contentRequirements: normalizeContentRequirements(parsed.contentRequirements, baseline.contentRequirements),
    documentRequirements: normalizeDocumentRequirements(parsed.documentRequirements, baseline.documentRequirements),
    submissionRequirements: normalizeSubmissionRequirements(
      parsed.submissionRequirements,
      baseline.submissionRequirements
    ),
    evaluationCriteria: normalizeStringList(parsed.evaluationCriteria, baseline.evaluationCriteria).slice(0, 10),
    styleProfile: mergeStyleProfile(parsed.styleProfile, baseline.styleProfile),
    underlyingIntent: mergeUnderlyingIntent(parsed.underlyingIntent, baseline.underlyingIntent),
    gaps,
    targetWordCount: posInt(parsed.targetWordCount) ?? baseline.targetWordCount,
    targetCharCount: posInt(parsed.targetCharCount) ?? baseline.targetCharCount
  };
}
async function handleAnalyzeTenderRequest(request) {
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
      analysis: { ...request.baseline, aiAnalyzed: false },
      provider: "heuristiek",
      model: "lokaal",
      enriched: false
    });
  }
  const userContent = `Opdrachtgever: ${request.buyerName}

Heuristische baseline (verbeter/verrijk waar de bronnen dat rechtvaardigen):
${JSON.stringify(request.baseline, null, 2)}

Bronnen:
${formatDocuments(request)}

Lever de volledige, aangescherpte uitvraag-analyse als JSON volgens het opgegeven schema.`;
  let analysis;
  try {
    const content = await completeChat(
      ai,
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent }
      ],
      { jsonMode: ai.provider !== "anthropic", maxTokens: 8e3, timeoutMs: 12e4, useThinking: false }
    );
    analysis = parseAnalysisJson(content, request.baseline);
  } catch {
    return Response.json({
      analysis: { ...request.baseline, aiAnalyzed: false },
      provider: "heuristiek",
      model: "lokaal",
      enriched: false
    });
  }
  return Response.json({
    analysis: { ...analysis, aiAnalyzed: true, analysisProvider: ai.provider, analysisModel: ai.model },
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

// api-src/analyze-tender.ts
var config = {
  maxDuration: 120
};
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const response = await handleAnalyzeTenderRequest(parseJsonBody(req.body));
    await sendWebResponse(res, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interne serverfout bij uitvraag-analyse.";
    res.status(500).json({ error: message });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  config
});

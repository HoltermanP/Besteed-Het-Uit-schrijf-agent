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

// api-src/review-draft.ts
var review_draft_exports = {};
__export(review_draft_exports, {
  config: () => config,
  default: () => handler
});
module.exports = __toCommonJS(review_draft_exports);

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

// api-src/_lib/reviewDraft.ts
var DOC_CHAR_LIMIT = 14e3;
var DRAFT_CHAR_LIMIT = 4e4;
var MAX_FINDINGS = 14;
var PRIORITY_RANK = {
  kritiek: 0,
  hoog: 1,
  normaal: 2
};
var stageLabels = {
  brons: "Brons (eerste concept)",
  zilver: "Zilver (review verwerkt)",
  goud: "Goud (eindversie)"
};
var SYSTEM_PROMPT = `Je bent een senior kwaliteitsreviewer voor Nederlandse aanbestedingen (Aanbestedingswet, EMVI, BPKV).
Je beoordeelt een concept-inschrijfstuk tegen de leidraad, de beoordelingscriteria en de bedrijfsbronnen.

DOEL
Lever scherpe, toetsbare reviewbevindingen die de winkans vergroten. Geen complimenten, geen samenvatting \u2014 alleen wat beter moet en waarom.

WAAR JE OP LET
- Dekking: is elk verplicht onderwerp en beoordelingscriterium uit de leidraad inhoudelijk geraakt?
- Bewijslast: zijn claims onderbouwd met concrete feiten, cases, KPI's of processen uit de bedrijfsbronnen? Signaleer lege superlatieven.
- Vraag achter de vraag: adresseert de tekst de onderliggende behoefte van de opdrachtgever, niet alleen de letterlijke vraag?
- Eisen aan de inschrijving: vorm, anonimiteit, taal, opmaak, indiening \u2014 schending is kritiek.
- Volume: te kort laat punten liggen; overschrijding van een hard maximum is diskwalificerend.
- Consistentie en concreetheid: vage passages, herhaling, ontbrekende rollen/planning.

PRIORITEITEN
- "kritiek": diskwalificerend of een hard criterium dat ontbreekt/geschonden is
- "hoog": kost aantoonbaar punten of verzwakt de score
- "normaal": verbetering die de kwaliteit verhoogt

REGELS
- Baseer je uitsluitend op de aangeleverde bronnen, analyse en het concept. Verzin geen eisen.
- Je krijgt een heuristische baseline met al gevonden punten. Herhaal die niet; vul aan met inhoudelijke, kwalitatieve bevindingen die een mens zou maken.
- Elke bevinding is concreet en handelingsgericht: benoem WAT en HOE het beter moet, met verwijzing naar sectie/criterium waar relevant.
- Maximaal ${MAX_FINDINGS} bevindingen, geordend op prioriteit.
- Schrijf in het Nederlands.

Antwoord uitsluitend met geldig JSON in exact deze vorm:
{
  "findings": [
    { "priority": "kritiek|hoog|normaal", "title": "", "detail": "" }
  ]
}`;
function trimSource(text, max = DOC_CHAR_LIMIT) {
  const cleaned = text.replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max)}\u2026`;
}
function draftToPlainText(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, DRAFT_CHAR_LIMIT);
}
function formatDocuments(request) {
  if (!request.documents.length) return "- geen bronnen aangeleverd";
  return request.documents.map((doc) => `- [${doc.type}] ${doc.name}:
${trimSource(doc.content)}`).join("\n\n");
}
function formatComments(request) {
  const open = request.comments.filter((comment) => !comment.resolved);
  if (!open.length) return "- geen open opmerkingen";
  return open.map((comment) => `- Fragment: ${comment.fragment}
  Opmerking: ${comment.note}`).join("\n");
}
function formatBaseline(baseline) {
  if (!baseline.length) return "- (geen)";
  return baseline.map((item) => `- [${item.priority}] ${item.title}: ${item.detail}`).join("\n");
}
function formatAnalysis(analysis) {
  if (!analysis) return "Geen leidraadanalyse beschikbaar \u2014 beoordeel op basis van bronnen en het concept.";
  const lines = [
    `- Samenvatting: ${analysis.summary}`,
    `- Leidraad gevonden: ${analysis.leidraadFound ? "ja" : "nee"}`
  ];
  if (analysis.targetWordCount) lines.push(`- Max. woorden: ${analysis.targetWordCount}`);
  if (analysis.targetCharCount) lines.push(`- Max. karakters: ${analysis.targetCharCount}`);
  const mandatory = (analysis.contentRequirements ?? []).filter((req) => req.mandatory);
  if (mandatory.length) {
    lines.push("- Verplichte onderwerpen:");
    mandatory.forEach((req) => lines.push(`  \u2022 ${req.topic} \u2014 ${req.detail}`));
  }
  if ((analysis.evaluationCriteria ?? []).length) {
    lines.push("- Beoordelingscriteria:");
    analysis.evaluationCriteria.forEach((criterion) => lines.push(`  \u2022 ${criterion}`));
  }
  const mandatorySubmission = (analysis.submissionRequirements ?? []).filter((req) => req.mandatory);
  if (mandatorySubmission.length) {
    lines.push("- Verplichte eisen aan de inschrijving (hard):");
    mandatorySubmission.forEach((req) => lines.push(`  \u2022 [${req.category}] ${req.requirement}`));
  }
  if (analysis.underlyingIntent) {
    lines.push(`- Vraag achter de vraag: ${analysis.underlyingIntent.questionBehindQuestion}`);
    lines.push(`- Onderliggende behoefte: ${analysis.underlyingIntent.underlyingNeed}`);
  }
  if ((analysis.gaps ?? []).length) {
    lines.push("- Bekende gaten:");
    analysis.gaps.forEach((gap) => lines.push(`  \u2022 ${gap}`));
  }
  return lines.join("\n");
}
function buildUserPrompt(request) {
  return `Fase: ${stageLabels[request.stage]}

Project:
- Titel: ${request.project.title}
- Opdrachtgever: ${request.project.buyer}
- Deadline: ${request.project.deadline}
- TenderNed: ${request.project.tendernedId}

Leidraadanalyse:
${formatAnalysis(request.analysis)}

Heuristische baseline (al gesignaleerd \u2014 NIET herhalen, wel aanvullen):
${formatBaseline(request.baseline)}

Open menselijke reviewopmerkingen (betrek in je oordeel):
${formatComments(request)}

=== BRONNEN ===
${formatDocuments(request)}

=== CONCEPT (platte tekst) ===
${draftToPlainText(request.draft) || "(leeg concept)"}

Lever je reviewbevindingen als JSON.`;
}
function normalizePriority(value) {
  return value === "kritiek" || value === "hoog" ? value : value === "normaal" ? "normaal" : "hoog";
}
function parseFindings(content) {
  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.findings)) return [];
  return parsed.findings.map((raw) => {
    if (!raw || typeof raw !== "object") return null;
    const item = raw;
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const detail = typeof item.detail === "string" ? item.detail.trim() : "";
    if (!title || !detail) return null;
    return { priority: normalizePriority(item.priority), title, detail };
  }).filter((item) => item !== null);
}
function normalizeTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function mergeFindings(baseline, aiFindings) {
  const seen = /* @__PURE__ */ new Set();
  const merged = [];
  for (const item of [...baseline, ...aiFindings]) {
    const key = normalizeTitle(item.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]).slice(0, MAX_FINDINGS);
}
async function handleReviewDraftRequest(request) {
  if (!request.draft?.trim()) {
    return Response.json({ error: "Geen concept om te reviewen." }, { status: 400 });
  }
  const baseline = Array.isArray(request.baseline) ? request.baseline : [];
  let ai;
  try {
    ai = resolveAiFromRequest(request.ai, "REVIEW_MODEL");
  } catch {
    return Response.json({
      findings: baseline,
      provider: "heuristiek",
      model: "lokaal",
      enriched: false
    });
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
    const aiFindings = parseFindings(content);
    return Response.json({
      findings: mergeFindings(baseline, aiFindings),
      provider: ai.provider,
      model: ai.model,
      enriched: aiFindings.length > 0
    });
  } catch {
    return Response.json({
      findings: baseline,
      provider: "heuristiek",
      model: "lokaal",
      enriched: false
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

// api-src/review-draft.ts
var config = {
  maxDuration: 120
};
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const response = await handleReviewDraftRequest(parseJsonBody(req.body));
    await sendWebResponse(res, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interne serverfout bij review.";
    res.status(500).json({ error: message });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  config
});

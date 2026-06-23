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

// api-src/rewrite-fragment.ts
var rewrite_fragment_exports = {};
__export(rewrite_fragment_exports, {
  config: () => config,
  default: () => handler
});
module.exports = __toCommonJS(rewrite_fragment_exports);

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

// api-src/_lib/rewriteFragment.ts
var stageLabels = {
  brons: "Brons (eerste concept)",
  zilver: "Zilver (review verwerkt)",
  goud: "Goud (eindversie)"
};
var DOC_CHAR_LIMIT = 6e3;
var SECTION_CHAR_LIMIT = 2e4;
var SYSTEM_PROMPT = `Je bent een senior bidwriter voor Nederlandse aanbestedingen (Aanbestedingswet, EMVI, BPKV).
Je krijgt \xC9\xC9N afgebakend onderdeel (een <section> of <header>) uit een lopend inschrijfdocument, plus \xE9\xE9n concrete reviewopmerking van een menselijke reviewer over een specifiek tekstfragment binnen dat onderdeel.

OPDRACHT
- Verwerk de opmerking door zo GERICHT mogelijk te herschrijven. Standaard pas je alleen de betreffende zin of alinea aan.
- Herschrijf een hele paragraaf of het volledige onderdeel ALLEEN als de opmerking dat inhoudelijk vereist (bijv. "herschrijf deze paragraaf", "dit hoofdstuk klopt niet", een tegenstrijdigheid die de hele sectie raakt).
- Behoud al het overige EXACT ongewijzigd: koppen, niet-genoemde alinea's, opsommingen, tabellen, visuele modellen, nummering en volgorde. Kopieer ongewijzigde delen letterlijk over.
- Verander het sectienummer en de titel (<h2>) niet, tenzij de opmerking daar expliciet om vraagt.

STIJL & INHOUD
- Nederlands, formeel, toetsbaar, actief waar passend. Volg de bestaande schrijfstijl en eventuele schrijfregels.
- Onderbouw met feiten uit de aangeleverde bronnen; verzin geen feiten; geen lege superlatieven.
- Verwijs niet naar AI, prompts of het reviewproces.
- Behoud de HTML-conventies: tabellen in <div class="table-wrap"><table><caption>\u2026</caption>\u2026; visuele modellen als <figure class="doc-model"> met een type-tabel (process-flow / timeline / org-chart / matrix-2x2 / model-grid). Voeg alleen een model of tabel toe als de opmerking daarom vraagt of het de boodschap aantoonbaar versterkt.

OUTPUT
- Uitsluitend het bijgewerkte onderdeel als geldige HTML, beginnend met hetzelfde root-element (<section \u2026> of <header \u2026>) en eindigend met de bijbehorende sluit-tag.
- Geen markdown, geen codeblok, geen uitleg, geen tekst eromheen.`;
function trimText(text, max) {
  const cleaned = (text ?? "").replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}\u2026` : cleaned;
}
function formatStyleContext(analysis) {
  if (!analysis) return "- Geen leidraadanalyse beschikbaar; volg de stijl van het bestaande onderdeel.";
  const lines = [`- Gecombineerde schrijfstijl: ${analysis.styleProfile.blendedGuidance}`];
  if (analysis.styleProfile.buyerSignals?.length) {
    lines.push(`- Opdrachtgevertaal: ${analysis.styleProfile.buyerSignals.join("; ")}`);
  }
  if (analysis.evaluationCriteria?.length) {
    lines.push(`- Relevante beoordelingscriteria: ${analysis.evaluationCriteria.slice(0, 6).join(", ")}`);
  }
  if (analysis.underlyingIntent) {
    lines.push(`- Vraag achter de vraag: ${analysis.underlyingIntent.questionBehindQuestion}`);
  }
  return lines.join("\n");
}
function formatDocuments(documents, types) {
  const relevant = documents.filter((doc) => types.includes(doc.type));
  if (!relevant.length) return "- geen";
  return relevant.map((doc) => `- [${doc.type}] ${doc.name}: ${trimText(doc.content, DOC_CHAR_LIMIT)}`).join("\n");
}
function buildUserPrompt(request) {
  return `Fase: ${stageLabels[request.stage]}

Project:
- Titel: ${request.project.title}
- Opdrachtgever: ${request.project.buyer}
- Deadline: ${request.project.deadline}
- TenderNed: ${request.project.tendernedId}

Stijl- en beoordelingscontext:
${formatStyleContext(request.analysis)}

Schrijfregels & voorbeeldstijl (volg toon en formulering):
${formatDocuments(request.documents, ["rules", "training"])}

Onderbouwende feiten over de inschrijver:
${formatDocuments(request.documents, ["company"])}

=== REVIEWOPMERKING ===
- Tekstfragment waar de opmerking over gaat: "${trimText(request.fragment, 600)}"
- Opmerking / instructie: ${request.note}

=== ONDERDEEL OM AAN TE PASSEN (herschrijf gericht, behoud de rest letterlijk) ===
${trimText(request.sectionHtml, SECTION_CHAR_LIMIT)}

Lever uitsluitend het bijgewerkte onderdeel als HTML, met hetzelfde root-element.`;
}
function rootTagOf(html) {
  return html.trim().match(/^<\s*([a-zA-Z0-9]+)/)?.[1]?.toLowerCase() ?? "section";
}
function extractElement(content, rootTag) {
  const fenced = content.match(/```html?\s*([\s\S]*?)```/i)?.[1];
  const text = (fenced ?? content).trim();
  const match = text.match(new RegExp(`<${rootTag}[\\s\\S]*</${rootTag}>`, "i"));
  if (match?.[0]?.trim()) return match[0].trim();
  throw new Error("Het herschreven onderdeel kon niet worden uitgelezen. Probeer opnieuw.");
}
async function generateFragmentRewrite(request, ai) {
  const rootTag = rootTagOf(request.sectionHtml);
  const content = await completeChat(
    ai,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(request) }
    ],
    { maxTokens: 16e3, timeoutMs: 12e4, useThinking: false, effort: "high" }
  );
  return {
    html: extractElement(content, rootTag),
    model: ai.model,
    provider: ai.provider
  };
}
async function handleRewriteFragmentRequest(body) {
  try {
    const request = body ?? {};
    if (!request.sectionHtml?.trim()) {
      throw new Error("Geen onderdeel om te herschrijven.");
    }
    if (!request.note?.trim()) {
      throw new Error("Geen opmerking om te verwerken.");
    }
    if (!["brons", "zilver", "goud"].includes(request.stage)) {
      throw new Error("Ongeldige fase.");
    }
    const ai = resolveAiFromRequest(request.ai, "WRITER_MODEL");
    const result = await generateFragmentRewrite(request, ai);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout bij herschrijven.";
    return Response.json({ error: message }, { status: 400 });
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

// api-src/rewrite-fragment.ts
var config = {
  maxDuration: 120
};
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const response = await handleRewriteFragmentRequest(parseJsonBody(req.body));
    await sendWebResponse(res, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interne serverfout bij herschrijven.";
    res.status(500).json({ error: message });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  config
});

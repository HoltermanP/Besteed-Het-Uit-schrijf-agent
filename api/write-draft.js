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

// api-src/write-draft.ts
var write_draft_exports = {};
__export(write_draft_exports, {
  config: () => config,
  default: () => handler
});
module.exports = __toCommonJS(write_draft_exports);

// api-src/_lib/aiClient.ts
var ANTHROPIC_VERSION = "2023-06-01";
function normalizeAnthropicBaseUrl(baseUrl) {
  return baseUrl.trim().replace(/\/$/, "").replace(/\/v1$/, "");
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
  if (usesAdaptiveThinking(ai.model)) {
    body.thinking = { type: "adaptive" };
    body.output_config = { effort: options.effort ?? "high" };
  }
  const baseUrl = normalizeAnthropicBaseUrl(ai.baseUrl || "https://api.anthropic.com");
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
  const baseUrl = (ai.baseUrl.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
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
    baseUrl: process.env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com",
    apiKey,
    model: process.env[modelEnv]?.trim() || "claude-opus-4-8"
  };
}
function resolveOpenAiFromEnv(modelEnv = "OPENAI_MODEL") {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    provider: "openai",
    baseUrl: process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
    apiKey,
    model: process.env[modelEnv]?.trim() || "gpt-4.1-mini"
  };
}
function resolveAiFromRequest(requestAi, envModelKey = "WRITER_MODEL") {
  if (requestAi?.apiKey?.trim()) {
    const defaults = requestAi.provider === "anthropic" ? { baseUrl: "https://api.anthropic.com", model: "claude-opus-4-8" } : { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" };
    return {
      provider: requestAi.provider,
      baseUrl: requestAi.baseUrl.trim() || defaults.baseUrl,
      apiKey: requestAi.apiKey.trim(),
      model: requestAi.model.trim() || defaults.model
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

// api-src/_lib/writeDraft.ts
var stageInstructions = {
  brons: "Maak een scherpe eerste versie. Focus op compliance, structuur, beoordelingscriteria en het benutten van alle bronnen.",
  zilver: "Verwerk menselijke opmerkingen en verbeter bewijsvoering, specificiteit, toon, consistentie en win-thema\u2019s.",
  goud: "Maak de eindversie overtuigend, compact, controleerbaar en exportklaar met duidelijke koppen en sterke HTML-opmaak."
};
var stageLabels = {
  brons: "Brons",
  zilver: "Zilver",
  goud: "Goud"
};
var SYSTEM_PROMPT = `Je bent een senior bidwriter voor Nederlandse aanbestedingen.
Schrijf in het Nederlands, formeel en toetsbaar. Vermijd promotionele taal.
Gebruik uitsluitend feiten en claims die onderbouwd zijn vanuit de aangeleverde bronnen.
Volg de schrijfregels, kwaliteitsstandaarden en voorbeeldteksten uit de stijlbibliotheek strikt.
Laat stijl, toon, structuur en kwaliteitsniveau aansluiten op de trainings- en richtlijndocumenten.
Antwoord uitsluitend met geldige HTML: \xE9\xE9n <article class="proposal-doc">\u2026</article>.
Gebruik semantische secties (<header>, <section class="doc-section">, <h1>, <h2>, <p>, <ul>, <table> waar passend).
Voeg een kicker toe met de fase (Brons/Zilver/Goud versie), metadata (opdrachtgever, deadline, TenderNed) en een lead-paragraaf.
Verwerk expliciet de beoordelingscriteria, risico\u2019s, duurzaamheid, implementatie en continuiteit als de bronnen dat vragen.
Geen markdown, geen uitleg buiten de HTML.`;
function summarizeDocument(content, max = 6e3) {
  const clean = content.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max).trim()}\u2026` : clean;
}
function buildUserPrompt(request) {
  const docsByType = (type) => request.documents.filter((doc) => doc.type === type).map((doc) => `- ${doc.name}: ${summarizeDocument(doc.content)}`).join("\n");
  const openComments = request.comments.filter((comment) => !comment.resolved).map((comment) => `- Fragment: ${comment.fragment}
  Opmerking: ${comment.note}`).join("\n");
  const analysisBlock = request.analysis ? `Leidraadanalyse:
- Samenvatting: ${request.analysis.summary}
- Doel woorden: ${request.analysis.targetWordCount ?? "onbekend"}
- Beoordelingscriteria: ${request.analysis.evaluationCriteria.join("; ") || "niet gevonden"}
- Stijl: ${request.analysis.styleProfile.blendedGuidance}
- Inhoudseisen: ${request.analysis.contentRequirements.slice(0, 10).map((item) => `${item.topic} (${item.mandatory ? "verplicht" : "gewenst"})`).join("; ")}` : "Geen leidraadanalyse beschikbaar.";
  const currentDraftBlock = request.currentDraft?.trim() ? `Huidig concept (verbeteren, niet opnieuw beginnen tenzij nodig):
${request.currentDraft.slice(0, 12e3)}` : "";
  return `Fase: ${stageLabels[request.stage]} \u2014 ${stageInstructions[request.stage]}

Project:
- Titel: ${request.project.title}
- Opdrachtgever: ${request.project.buyer}
- Deadline: ${request.project.deadline}
- TenderNed: ${request.project.tendernedId}

${analysisBlock}

Aanbestedingsbronnen:
${docsByType("tender") || "- geen"}

Bedrijfsbronnen:
${docsByType("company") || "- geen"}

Schrijfregels en kwaliteitsrichtlijnen (verplicht volgen):
${docsByType("rules") || "- geen"}

Schrijfstijl, voorbeelden en trainingsmateriaal (toon/structuur/kwaliteit):
${docsByType("training") || "- geen"}

Open reviewopmerkingen:
${openComments || "- geen"}

${currentDraftBlock}

Genereer het volledige HTML-artikel.`;
}
function extractHtml(content) {
  const fenced = content.match(/```html?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  const article = content.match(/<article[\s\S]*<\/article>/i);
  if (article?.[0]) return article[0];
  const trimmed = content.trim();
  if (trimmed.startsWith("<article")) return trimmed;
  throw new Error("Schrijfagent gaf geen geldige HTML terug.");
}
async function generateDraftWithAi(request) {
  const ai = resolveAiFromRequest(request.ai, "WRITER_MODEL");
  const content = await completeChat(
    ai,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(request) }
    ],
    {
      maxTokens: 16e3,
      timeoutMs: 18e4,
      effort: request.stage === "goud" ? "xhigh" : "high"
    }
  );
  return {
    html: extractHtml(content),
    model: ai.model,
    provider: ai.provider
  };
}
async function handleWriteDraftRequest(body) {
  try {
    const request = body ?? {};
    if (!request.project?.title?.trim()) {
      throw new Error("Projectgegevens ontbreken.");
    }
    if (!["brons", "zilver", "goud"].includes(request.stage)) {
      throw new Error("Ongeldige fase.");
    }
    const result = await generateDraftWithAi(request);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout bij genereren.";
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

// api-src/write-draft.ts
var config = {
  maxDuration: 60
};
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const response = await handleWriteDraftRequest(parseJsonBody(req.body));
    await sendWebResponse(res, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interne serverfout bij genereren.";
    res.status(500).json({ error: message });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  config
});

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
async function* streamAnthropic(ai, messages, options) {
  const { system, chatMessages } = splitMessages(messages);
  const body = {
    model: ai.model,
    max_tokens: options.maxTokens ?? 16e3,
    messages: chatMessages,
    stream: true
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
    signal: AbortSignal.timeout(options.timeoutMs ?? 18e4)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Anthropic API mislukt (${response.status}): ${detail.slice(0, 280)}`);
  }
  if (!response.body) throw new Error("Anthropic streaming mislukt: geen response body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload);
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          const text = event.delta.text;
          if (text) yield text;
        }
      } catch {
      }
    }
  }
}
async function* streamOpenAiCompatible(ai, messages, options) {
  const baseUrl = (ai.baseUrl.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  const body = {
    model: ai.model,
    temperature: 0.2,
    messages,
    max_tokens: options.maxTokens ?? 16e3,
    stream: true
  };
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ai.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 18e4)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI API mislukt (${response.status}): ${detail.slice(0, 280)}`);
  }
  if (!response.body) throw new Error("AI streaming mislukt: geen response body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload);
        const text = event.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch {
      }
    }
  }
}
async function* streamChat(ai, messages, options = {}) {
  if (ai.provider === "anthropic") {
    yield* streamAnthropic(ai, messages, options);
    return;
  }
  yield* streamOpenAiCompatible(ai, messages, options);
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
  brons: "Schrijf een volledige eerste versie van het gevraagde inschrijfstuk. Dek alle verplichte onderwerpen af. Houd je aan de volumelimiet als die in de leidraad staat; anders schrijf uitgebreid en volledig.",
  zilver: "Verbeter het bestaande concept: verwerk reviewopmerkingen, versterk bewijsvoering per beoordelingscriterium en vul inhoudelijke gaten. Respecteer volumelimieten; inkort alleen als de tekst te lang is.",
  goud: "Lever de definitieve versie: binnen woord- en/of karakterlimiet, geen herhaling, elke sectie toetsbaar aan beoordelingscriteria, exportklaar HTML."
};
var stageLabels = {
  brons: "Brons",
  zilver: "Zilver",
  goud: "Goud"
};
var SYSTEM_PROMPT = `Je bent een senior bidwriter voor Nederlandse aanbestedingen (Aanbestedingswet, EMVI, BPKV).

DOEL
Schrijf het concrete inschrijfstuk dat de opdrachtgever vraagt \u2014 geen generiek salesdocument. Structuur, koppen en volgorde volgen de leidraad en beoordelingscriteria, niet een vaste template.

BRONHI\xCBRARCHIE (streng, van hoog naar laag)
1. Leidraad / aanbestedingsstukken \u2014 gevraagde stukken, onderwerpen, woord- en paginalimieten, beoordelingscriteria
2. Schrijfregels & kwaliteitsstandaarden \u2014 verplichte formulering, kwaliteitsnormen, verboden formuleringen
3. Bedrijfsinformatie \u2014 alleen feitelijke claims over het inschrijvende bedrijf
4. Schrijfstijl & voorbeeldteksten \u2014 toon, zinsbouw, opmaak; geen nieuwe inhoud verzinnen

INHOUDELIJKE REGELS
- Maak per verplicht onderwerp uit de leidraadanalyse een eigen <section class="doc-section"> met genummerde <h2>
- Koppel elke sectie in een <p class="section-subtitle"> aan het relevante beoordelingscriterium of subcriterium
- Beantwoord wat de opdrachtgever expliciet vraagt; voeg geen standaardparagrafen toe over risico, duurzaamheid, implementatie of continuiteit tenzij de leidraad dat vereist
- Onderbouw uitspraken met feiten uit bedrijfsbronnen; geen lege superlatieven
- Ontbrekende feiten niet verzinnen \u2014 weglaten of voorzichtig formuleren
- Verwijs niet naar het schrijfproces, AI, prompts of interne review

STIJL
- Nederlands, formeel, toetsbaar, actief waar passend
- Volg schrijfregels en de gecombineerde schrijfstijl uit de analyse

VOLUME (cruciaal)
- Als de leidraad een maximum aantal woorden, karakters of pagina's noemt: blijf daar STRIKT onder (tel alleen zichtbare tekst, geen HTML-tags)
- Als er geen maximum is: schrijf alles wat nodig is om alle verplichte onderwerpen volledig te beantwoorden \u2014 uitgebreid en concreet mag
- Geen opvulling of herhaling; elke alinea moet inhoud toevoegen

OUTPUT (alleen HTML, geen markdown)
- E\xE9n <article class="proposal-doc">\u2026</article>
- <header class="doc-header"> met kicker (Brons/Zilver/Goud versie), <h1>, metadata (<dl class="doc-meta">), <p class="lead">
- Per gevraagd stuk/onderwerp: <section class="doc-section"> met <h2>, <p class="section-subtitle">, inhoud (<p>, <ul>, <table> alleen waar passend)
- Geen meta-sectie over schrijfkwaliteit, stijlbibliotheek of werkwijze van het schrijven
- Geen tekst buiten het HTML-artikel`;
var DOC_CHAR_LIMITS = {
  tender: 14e3,
  company: 8e3,
  rules: 8e3,
  training: 8e3
};
function summarizeDocument(content, max) {
  const clean = content.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max).trim()}\u2026` : clean;
}
function hasVolumeLimit(analysis) {
  return Boolean(
    analysis.targetWordCount || analysis.targetCharCount || analysis.wordLimits.some((limit) => limit.unit === "paginas" && limit.max)
  );
}
function formatVolumeLimits(analysis) {
  if (!analysis.wordLimits.length) {
    return "- Geen woord-, karakter- of paginalimiet gedetecteerd in de leidraad.";
  }
  return analysis.wordLimits.map((limit) => {
    const scope = limit.section ? ` (${limit.section})` : "";
    const value = limit.min && limit.max ? `${limit.min}\u2013${limit.max} ${limit.unit}` : limit.max ? `max. ${limit.max} ${limit.unit}` : limit.min ? `min. ${limit.min} ${limit.unit}` : limit.unit;
    return `- ${limit.label}${scope}: ${value} [${limit.source}]`;
  }).join("\n");
}
function buildVolumeInstruction(analysis) {
  if (!analysis || !hasVolumeLimit(analysis)) {
    return `VOLUME \u2014 GEEN LIMIET IN LEIDRAAD
- Er is geen maximum aantal woorden of karakters gevonden
- Schrijf alles wat nodig is: alle verplichte onderwerpen en beoordelingscriteria volledig uitwerken
- Wees uitgebreid, concreet en onderbouwd \u2014 kort niet af om lengte te sparen
- Geen herhaling of opvulling; wel volledigheid`;
  }
  const lines = [
    "VOLUME \u2014 HARDE LIMIET (niet overschrijden)",
    "Tel alleen zichtbare tekst in het artikel (paragrafen, koppen, lijsten, tabelcellen). Geen HTML-tags, geen metadata."
  ];
  if (analysis.targetWordCount) {
    const target = analysis.targetWordCount;
    lines.push(
      `- Maximum woorden: ${target} \u2014 streef naar ${Math.round(target * 0.9)}\u2013${target} woorden`
    );
  }
  if (analysis.targetCharCount) {
    const target = analysis.targetCharCount;
    lines.push(
      `- Maximum karakters: ${target.toLocaleString("nl-NL")} \u2014 streef naar ${Math.round(target * 0.9).toLocaleString("nl-NL")}\u2013${target.toLocaleString("nl-NL")} karakters`
    );
  }
  analysis.wordLimits.filter((limit) => limit.unit === "paginas" && limit.max).forEach((limit) => {
    lines.push(
      `- Maximum pagina's: ${limit.max}${limit.section ? ` (${limit.section})` : ""} \u2014 houd de tekst compact genoeg`
    );
  });
  lines.push(
    "- Bij zowel woorden als karakters: beide limieten gelden; kies de kortste variant die alle verplichte eisen dekt",
    "- Prioriteit: eerst alle verplichte onderwerpen volledig, daarna detail \u2014 nooit boven het maximum",
    "- Te lang? inkorten door herhaling en bijlagen te schrappen, niet door verplichte eisen weg te laten"
  );
  return lines.join("\n");
}
function formatVolumeSummary(analysis) {
  if (!hasVolumeLimit(analysis)) return "geen limiet \u2014 schrijf volledig en uitgebreid";
  const parts = [];
  if (analysis.targetWordCount) parts.push(`max. ${analysis.targetWordCount} woorden`);
  if (analysis.targetCharCount) {
    parts.push(`max. ${analysis.targetCharCount.toLocaleString("nl-NL")} karakters`);
  }
  const pageMax = analysis.wordLimits.filter((limit) => limit.unit === "paginas" && limit.max).map((limit) => limit.max);
  if (pageMax.length) parts.push(`max. ${pageMax.join("/")} pagina's`);
  return parts.join(", ");
}
function formatContentRequirements(analysis) {
  if (!analysis.contentRequirements.length) {
    return "- Geen inhoudseisen gedetecteerd \u2014 leid structuur af uit aanbestedingsbronnen en beoordelingscriteria.";
  }
  const mandatory = analysis.contentRequirements.filter((item) => item.mandatory);
  const optional = analysis.contentRequirements.filter((item) => !item.mandatory);
  const lines = [];
  if (mandatory.length) {
    lines.push("Verplichte onderwerpen (elk een aparte sectie):");
    mandatory.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.topic} \u2014 ${item.detail} [${item.source}]`);
    });
  }
  if (optional.length) {
    lines.push("", "Optioneel (alleen opnemen als limiet en relevantie het toelaten):");
    optional.slice(0, 12).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.topic} \u2014 ${item.detail}`);
    });
  }
  return lines.join("\n");
}
function formatEvaluationCriteria(analysis) {
  if (!analysis.evaluationCriteria.length) {
    return "- Geen criteria gedetecteerd \u2014 koppel secties aan expliciete eisen uit de leidraad.";
  }
  return analysis.evaluationCriteria.map((criterion, index) => `${index + 1}. ${criterion}`).join("\n");
}
function formatDocumentRequirements(analysis) {
  if (!analysis.documentRequirements.length) return "- geen";
  return analysis.documentRequirements.map(
    (doc) => `- ${doc.name} (${doc.mandatory ? "verplicht" : "optioneel"}) \u2014 ${doc.source}`
  ).join("\n");
}
function buildStructureInstruction(analysis) {
  if (!analysis) {
    return `STRUCTUUR
- Leid koppen en secties af uit de aanbestedingsbronnen
- Geen vaste EMVI-template; alleen wat de opdrachtgever vraagt

${buildVolumeInstruction(analysis)}`;
  }
  return `STRUCTUUR (verplicht volgen)

${buildVolumeInstruction(analysis)}

Gedetecteerde limieten uit leidraad:
${formatVolumeLimits(analysis)}

${formatContentRequirements(analysis)}

Beoordelingscriteria (elke sectie moet minstens \xE9\xE9n criterium adresseren):
${formatEvaluationCriteria(analysis)}

Verwachte bijlagen (inhoudelijk verwerken waar het plan van aanpak dat vraagt; niet als losse lijst dumpen):
${formatDocumentRequirements(analysis)}`;
}
function buildAnalysisBlock(analysis) {
  if (!analysis) return "Geen leidraadanalyse beschikbaar \u2014 leid structuur af uit aanbestedingsbronnen.";
  const gaps = analysis.gaps.length > 0 ? `
Aandachtspunten / gaten:
${analysis.gaps.map((gap) => `- ${gap}`).join("\n")}` : "";
  return `Leidraadanalyse:
- Samenvatting: ${analysis.summary}
- Leidraad gevonden: ${analysis.leidraadFound ? `ja (${analysis.leidraadSource ?? "bron"})` : "nee"}
- Volume: ${formatVolumeSummary(analysis)}
- Schrijfstijl: ${analysis.styleProfile.blendedGuidance}
- Inschrijver (${analysis.styleProfile.companyName}): ${analysis.styleProfile.companySignals.join("; ") || "geen signalen"}
- Opdrachtgever (${analysis.styleProfile.buyerName}): ${analysis.styleProfile.buyerSignals.join("; ") || "geen signalen"}${gaps}`;
}
function docsByType(request, type) {
  return request.documents.filter((doc) => doc.type === type).map((doc) => `- ${doc.name}:
${summarizeDocument(doc.content, DOC_CHAR_LIMITS[type])}`).join("\n\n");
}
function buildUserPrompt(request) {
  const openComments = request.comments.filter((comment) => !comment.resolved).map((comment) => `- Fragment: ${comment.fragment}
  Opmerking: ${comment.note}`).join("\n");
  const currentDraftBlock = request.currentDraft?.trim() ? `HUIDIG CONCEPT (uitgangspunt \u2014 structuur behouden tenzij leidraad anders vereist):
${request.currentDraft.slice(0, 14e3)}` : "";
  const volumeLimited = request.analysis ? hasVolumeLimit(request.analysis) : false;
  const stageTask = request.stage === "brons" ? volumeLimited ? "Schrijf het volledige inschrijfstuk binnen de volumelimiet uit de leidraad." : "Schrijf het volledige inschrijfstuk \u2014 uitgebreid, met alle verplichte onderwerpen volledig uitgewerkt." : request.stage === "zilver" ? "Verbeter het huidige concept; verwerk alle open reviewopmerkingen en respecteer volumelimieten." : volumeLimited ? "Finaliseer het concept: binnen woord- en/of karakterlimiet, exportklaar." : "Finaliseer het concept: volledig en uitgebreid, zonder inhoud weg te laten.";
  return `Fase: ${stageLabels[request.stage]} \u2014 ${stageInstructions[request.stage]}

Project:
- Titel: ${request.project.title}
- Opdrachtgever: ${request.project.buyer}
- Deadline: ${request.project.deadline}
- TenderNed: ${request.project.tendernedId}

${buildAnalysisBlock(request.analysis)}

${buildStructureInstruction(request.analysis)}

=== BRONNEN ===

Aanbestedingsstukken (leidraad \u2014 leidend voor structuur en eisen):
${docsByType(request, "tender") || "- geen"}

Bedrijfsinformatie (feiten voor onderbouwing):
${docsByType(request, "company") || "- geen"}

Schrijfregels & kwaliteitsstandaarden (verplicht \u2014 formulering en kwaliteit):
${docsByType(request, "rules") || "- geen"}

Schrijfstijl & voorbeeldteksten (toon/structuur \u2014 geen nieuwe inhoud):
${docsByType(request, "training") || "- geen"}

Open reviewopmerkingen:
${openComments || "- geen"}

${currentDraftBlock}

${stageTask}
Lever uitsluitend het HTML-artikel.`;
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
function buildChatMessages(request) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(request) }
  ];
}
function chatOptions(request) {
  return {
    maxTokens: 16e3,
    timeoutMs: 18e4,
    effort: request.stage === "goud" ? "xhigh" : "high"
  };
}
async function handleWriteDraftStreamRequest(request) {
  const ai = resolveAiFromRequest(request.ai, "WRITER_MODEL");
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (payload) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}

`));
      };
      try {
        let accumulated = "";
        for await (const chunk of streamChat(ai, buildChatMessages(request), chatOptions(request))) {
          accumulated += chunk;
          send({ type: "delta", text: chunk, accumulated });
        }
        const html = extractHtml(accumulated);
        send({
          type: "done",
          html,
          model: ai.model,
          provider: ai.provider
        });
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Onbekende fout bij genereren.";
        send({ type: "error", error: message });
        controller.close();
      }
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
async function generateDraftWithAi(request) {
  const ai = resolveAiFromRequest(request.ai, "WRITER_MODEL");
  const content = await completeChat(
    ai,
    buildChatMessages(request),
    chatOptions(request)
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
    if (request.stream) {
      return handleWriteDraftStreamRequest(request);
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
async function pipeWebStream(res, response) {
  res.status(response.status);
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "content-encoding") return;
    res.setHeader(key, value);
  });
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const body = parseJsonBody(req.body);
    const response = await handleWriteDraftRequest(body);
    if (body.stream) {
      await pipeWebStream(res, response);
      return;
    }
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

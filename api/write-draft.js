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
async function* streamAnthropic(ai, messages, options) {
  const { system, chatMessages } = splitMessages(messages);
  const body = {
    model: ai.model,
    max_tokens: options.maxTokens ?? 16e3,
    messages: chatMessages,
    stream: true
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
  if (buffer.trim()) {
    for (const line of buffer.split("\n")) {
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
  const baseUrl = normalizeBaseUrl(ai.baseUrl, DEFAULT_OPENAI_BASE_URL).replace(/\/$/, "");
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

// api-src/_lib/writeDraft.ts
var stageInstructions = {
  brons: "Schrijf een volledige eerste versie van het gevraagde inschrijfstuk. Werk elk verplicht onderwerp diepgaand uit. Staat er een maximum in de leidraad: gebruik dat woord- of karakterbudget bijna volledig (richting het maximum, zonder overschrijding). Geen maximum: schrijf zeer uitgebreid.",
  zilver: "Verbeter en breid het bestaande concept uit: verwerk reviewopmerkingen, versterk bewijsvoering en vul gaten. Met leidraad-maximum: breid uit tot dicht bij het maximum; inkort alleen boven het maximum.",
  goud: "Lever de definitieve versie: volledig, concreet en exportklaar. Met leidraad-maximum: eindig op 97\u2013100% van het maximum; zonder maximum zeer uitgebreid."
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
- Beantwoord wat de opdrachtgever expliciet vraagt \xE9n adresseer de onderliggende behoefte uit de analyse "vraag achter de vraag"
- Laat in elke sectie impliciet zien dat u het werkelijke doel van de opdrachtgever begrijpt (zekerheid, grip, beheersbaarheid, EMVI-prioriteiten)
- Voeg geen standaardparagrafen toe over risico, duurzaamheid, implementatie of continuiteit tenzij de leidraad dat vereist
- Onderbouw uitspraken met feiten uit bedrijfsbronnen; geen lege superlatieven
- Ontbrekende feiten niet verzinnen \u2014 weglaten of voorzichtig formuleren
- Verwijs niet naar het schrijfproces, AI, prompts of interne review

STIJL
- Nederlands, formeel, toetsbaar, actief waar passend
- Volg schrijfregels en de gecombineerde schrijfstijl uit de analyse

VOLUME (cruciaal)
- Als de leidraad een maximum aantal woorden, karakters of pagina's noemt: blijf daar STRIKT onder, maar gebruik het budget bijna volledig \u2014 schrijf richting het maximum (97\u2013100%), niet een korte samenvatting
- Als er GEEN maximum is: schrijf ZEER uitgebreid \u2014 minimaal 2500 woorden totaal, tenzij de leidraad expliciet korter vraagt
- Per verplicht onderwerp: minimaal 4\u20138 alinea's met concrete werkwijze, voorbeelden, KPI's, rollen, planning en bewijs
- Dit is een volwaardig inschrijfstuk voor een aanbesteding, geen managementsamenvatting of bullet-only tekst
- Geen opvulling of herhaling; wel volledige uitwerking van alle eisen

OUTPUT (alleen HTML, geen markdown)
- E\xE9n <article class="proposal-doc">\u2026</article>
- <header class="doc-header"> met kicker (Brons/Zilver/Goud versie), <h1>, metadata (<dl class="doc-meta">), <p class="lead">
- Per gevraagd stuk/onderwerp: <section class="doc-section"> met <h2>, <p class="section-subtitle">, inhoud (<p>, <ul>, <table> alleen waar passend)
- Geen meta-sectie over schrijfkwaliteit, stijlbibliotheek of werkwijze van het schrijven
- Geen tekst buiten het HTML-artikel`;
var DOC_CHAR_LIMITS = {
  tender: 4e4,
  company: 2e4,
  rules: 2e4,
  training: 2e4
};
var VOLUME_TARGET_RATIO = 0.97;
var VOLUME_FLOOR_RATIO = 0.92;
function summarizeDocument(content, max) {
  const clean = content.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max).trim()}\u2026` : clean;
}
function hasVolumeLimit(analysis) {
  return Boolean(
    analysis.targetWordCount || analysis.targetCharCount || (analysis.wordLimits ?? []).some((limit) => limit.unit === "paginas" && limit.max)
  );
}
function formatVolumeLimits(analysis) {
  const wordLimits = analysis.wordLimits ?? [];
  if (!wordLimits.length) {
    return "- Geen woord-, karakter- of paginalimiet gedetecteerd in de leidraad.";
  }
  return wordLimits.map((limit) => {
    const scope = limit.section ? ` (${limit.section})` : "";
    const value = limit.min && limit.max ? `${limit.min}\u2013${limit.max} ${limit.unit}` : limit.max ? `max. ${limit.max} ${limit.unit}` : limit.min ? `min. ${limit.min} ${limit.unit}` : limit.unit;
    return `- ${limit.label}${scope}: ${value} [${limit.source}]`;
  }).join("\n");
}
function buildVolumeInstruction(analysis) {
  if (!analysis || !hasVolumeLimit(analysis)) {
    const mandatoryCount = analysis?.contentRequirements?.filter((item) => item.mandatory).length ?? 0;
    const minWords = Math.max(2500, mandatoryCount * 350);
    return `VOLUME \u2014 GEEN MAXIMUM IN LEIDRAAD (schrijf zeer uitgebreid)
- Er is geen maximum aantal woorden of karakters gevonden in de leidraad
- Streef naar minimaal ${minWords.toLocaleString("nl-NL")} woorden totaal \u2014 liever te uitgebreid dan te kort
- Per verplicht onderwerp: minimaal 4\u20138 alinea's, met concrete werkwijze, voorbeelden, KPI's, rollen, planning en bewijs
- Werk alle beoordelingscriteria volledig uit; geen samenvattingen of staccato bullets als enige inhoud
- Geen herhaling of opvulling; wel volledige, diepgaande uitwerking`;
  }
  const lines = [
    "VOLUME \u2014 HARDE LIMIET + GEBRUIK HET BUDGET",
    "Tel alleen zichtbare tekst in het artikel (paragrafen, koppen, lijsten, tabelcellen). Geen HTML-tags, geen metadata.",
    "Schrijf richting het maximum uit de leidraad \u2014 een te kort stuk laat punten liggen; een te lang stuk is diskwalificerend."
  ];
  if (analysis.targetWordCount) {
    const target = analysis.targetWordCount;
    const aimLow = Math.round(target * VOLUME_TARGET_RATIO);
    lines.push(
      `- Maximum woorden: ${target} \u2014 streef naar ${aimLow}\u2013${target} woorden (97\u2013100% van het maximum)`,
      `- Te kort (< ${Math.round(target * VOLUME_FLOOR_RATIO)} woorden) is onvoldoende; te lang (> ${target}) is niet toegestaan`
    );
  }
  if (analysis.targetCharCount) {
    const target = analysis.targetCharCount;
    const aimLow = Math.round(target * VOLUME_TARGET_RATIO);
    lines.push(
      `- Maximum karakters: ${target.toLocaleString("nl-NL")} \u2014 streef naar ${aimLow.toLocaleString("nl-NL")}\u2013${target.toLocaleString("nl-NL")} karakters`
    );
  }
  ;
  (analysis.wordLimits ?? []).filter((limit) => limit.unit === "paginas" && limit.max).forEach((limit) => {
    lines.push(
      `- Maximum pagina's: ${limit.max}${limit.section ? ` (${limit.section})` : ""} \u2014 gebruik het paginabudget volledig binnen de limiet`
    );
  });
  lines.push(
    "- Bij zowel woorden als karakters: beide limieten gelden; benut het strakste maximum zo volledig mogelijk",
    "- Prioriteit: eerst alle verplichte onderwerpen volledig, daarna detail tot dicht bij het maximum",
    "- Te lang? inkorten door herhaling te schrappen, niet door verplichte eisen weg te laten"
  );
  return lines.join("\n");
}
function formatVolumeSummary(analysis) {
  if (!hasVolumeLimit(analysis)) {
    const mandatoryCount = analysis.contentRequirements?.filter((item) => item.mandatory).length ?? 0;
    const minWords = Math.max(2500, mandatoryCount * 350);
    return `geen maximum \u2014 schrijf zeer uitgebreid (streef min. ${minWords.toLocaleString("nl-NL")} woorden)`;
  }
  const parts = [];
  if (analysis.targetWordCount) {
    parts.push(`max. ${analysis.targetWordCount} woorden (streef 97\u2013100%)`);
  }
  if (analysis.targetCharCount) {
    parts.push(`max. ${analysis.targetCharCount.toLocaleString("nl-NL")} karakters`);
  }
  const pageMax = (analysis.wordLimits ?? []).filter((limit) => limit.unit === "paginas" && limit.max).map((limit) => limit.max);
  if (pageMax.length) parts.push(`max. ${pageMax.join("/")} pagina's`);
  return parts.join(", ");
}
function formatContentRequirements(analysis) {
  const contentRequirements = analysis.contentRequirements ?? [];
  if (!contentRequirements.length) {
    return "- Geen inhoudseisen gedetecteerd \u2014 leid structuur af uit aanbestedingsbronnen en beoordelingscriteria.";
  }
  const mandatory = contentRequirements.filter((item) => item.mandatory);
  const optional = contentRequirements.filter((item) => !item.mandatory);
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
  const evaluationCriteria = analysis.evaluationCriteria ?? [];
  if (!evaluationCriteria.length) {
    return "- Geen criteria gedetecteerd \u2014 koppel secties aan expliciete eisen uit de leidraad.";
  }
  return evaluationCriteria.map((criterion, index) => `${index + 1}. ${criterion}`).join("\n");
}
function formatDocumentRequirements(analysis) {
  const documentRequirements = analysis.documentRequirements ?? [];
  if (!documentRequirements.length) return "- geen";
  return documentRequirements.map(
    (doc) => `- ${doc.name} (${doc.mandatory ? "verplicht" : "optioneel"}) \u2014 ${doc.source}`
  ).join("\n");
}
function formatUnderlyingIntent(analysis) {
  const intent = analysis.underlyingIntent;
  if (!intent) {
    return "- Geen vraag-achter-de-vraag analyse \u2014 leid onderliggende behoefte af uit leidraad en beoordelingscriteria.";
  }
  const lines = [
    `Expliciete vraag: ${intent.explicitQuestion}`,
    `Vraag achter de vraag: ${intent.questionBehindQuestion}`,
    `Onderliggende behoefte: ${intent.underlyingNeed}`
  ];
  if (intent.buyerPriorities.length) {
    lines.push("", "Prioriteiten opdrachtgever:");
    intent.buyerPriorities.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
  }
  if (intent.implicitSuccessFactors.length) {
    lines.push("", "Impliciete succescriteria:");
    intent.implicitSuccessFactors.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
  }
  lines.push("", `Schrijflens: ${intent.writingGuidance}`);
  lines.push("", "Let op: teamBrief uit de analyse is intern \u2014 niet opnemen in het inschrijfdocument.");
  return lines.join("\n");
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

Vraag achter de vraag (schrijflens \u2014 verwerk in inhoud, niet als apart meta-stuk):
${formatUnderlyingIntent(analysis)}

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
- Opdrachtgever (${analysis.styleProfile.buyerName}): ${analysis.styleProfile.buyerSignals.join("; ") || "geen signalen"}
${analysis.underlyingIntent ? `- Vraag achter de vraag: ${analysis.underlyingIntent.questionBehindQuestion}` : ""}${gaps}`;
}
function docsByType(request, type) {
  return request.documents.filter((doc) => doc.type === type).map((doc) => `- ${doc.name}:
${summarizeDocument(doc.content, DOC_CHAR_LIMITS[type])}`).join("\n\n");
}
function buildUserPrompt(request) {
  const openComments = request.comments.filter((comment) => !comment.resolved).map((comment) => `- Fragment: ${comment.fragment}
  Opmerking: ${comment.note}`).join("\n");
  const currentDraftBlock = request.currentDraft?.trim() ? `HUIDIG CONCEPT (uitgangspunt \u2014 structuur behouden tenzij leidraad anders vereist):
${request.currentDraft.slice(0, 4e4)}` : "";
  const volumeLimited = request.analysis ? hasVolumeLimit(request.analysis) : false;
  const stageTask = request.stage === "brons" ? volumeLimited ? "Schrijf het volledige inschrijfstuk en gebruik het volumemaximum uit de leidraad bijna volledig (97\u2013100%, zonder overschrijding)." : "Schrijf het volledige inschrijfstuk zeer uitgebreid \u2014 minimaal 2500 woorden, met alle verplichte onderwerpen diepgaand uitgewerkt." : request.stage === "zilver" ? volumeLimited ? "Verbeter het huidige concept; verwerk alle open reviewopmerkingen en breid uit tot dicht bij het leidraad-maximum." : "Verbeter het huidige concept; verwerk alle open reviewopmerkingen en breid uit waar nodig." : volumeLimited ? "Finaliseer het concept op 97\u2013100% van het leidraad-maximum, exportklaar." : "Finaliseer het concept: volledig en uitgebreid, zonder inhoud weg te laten.";
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
  if (fenced?.[1]?.trim() && isArticleComplete(fenced[1])) return fenced[1].trim();
  const article = content.match(/<article[\s\S]*<\/article>/i);
  if (article?.[0]) return article[0];
  const trimmed = content.trim();
  if (trimmed.startsWith("<article") && isArticleComplete(trimmed)) return trimmed;
  throw new Error("Concept is onvolledig \u2014 het HTML-artikel is niet afgesloten.");
}
function isArticleComplete(content) {
  return /<\/article>\s*$/i.test(content.trim());
}
function countVisibleWords(html) {
  const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return plain ? plain.split(" ").length : 0;
}
function countVisibleCharacters(html) {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().length;
}
function minimumWordTarget(request) {
  const analysis = request.analysis;
  if (analysis?.targetWordCount) {
    return Math.round(analysis.targetWordCount * VOLUME_TARGET_RATIO);
  }
  const mandatory = analysis?.contentRequirements?.filter((item) => item.mandatory).length ?? 0;
  return Math.max(2500, mandatory * 350);
}
function needsContinuation(accumulated, request) {
  if (!isArticleComplete(accumulated)) return true;
  const analysis = request.analysis;
  const words = countVisibleWords(accumulated);
  if (analysis?.targetWordCount) {
    return words < Math.round(analysis.targetWordCount * VOLUME_FLOOR_RATIO);
  }
  if (analysis?.targetCharCount) {
    return countVisibleCharacters(accumulated) < Math.round(analysis.targetCharCount * VOLUME_FLOOR_RATIO);
  }
  return words < minimumWordTarget(request);
}
function buildContinuationPrompt(request, accumulated) {
  const analysis = request.analysis;
  const words = countVisibleWords(accumulated);
  let volumeHint = "";
  if (analysis?.targetWordCount) {
    const target = analysis.targetWordCount;
    const aimLow = Math.round(target * VOLUME_TARGET_RATIO);
    volumeHint = ` Het concept telt nu circa ${words} woorden. Breid uit richting het maximum van ${target} woorden (streef ${aimLow}\u2013${target}) zonder het maximum te overschrijden.`;
  } else if (analysis?.targetCharCount) {
    const target = analysis.targetCharCount;
    const chars = countVisibleCharacters(accumulated);
    const aimLow = Math.round(target * VOLUME_TARGET_RATIO);
    volumeHint = ` Het concept telt nu circa ${chars.toLocaleString("nl-NL")} karakters. Breid uit richting het maximum van ${target.toLocaleString("nl-NL")} karakters (streef ${aimLow.toLocaleString("nl-NL")}\u2013${target.toLocaleString("nl-NL")}).`;
  } else {
    volumeHint = ` Het concept telt nu circa ${words} woorden. Werk alle resterende verplichte onderwerpen volledig uit tot minimaal ${minimumWordTarget(request)} woorden.`;
  }
  return `Het vorige antwoord stopte voortijdig. Ga EXACT verder waar de tekst stopte \u2014 herhaal geen bestaande alinea's of secties. Sluit alle open HTML-tags af en eindig met </article>.${volumeHint}`;
}
async function streamDraftToCompletion(ai, request, send) {
  const options = chatOptions(request);
  const baseMessages = buildChatMessages(request);
  let accumulated = "";
  let messages = baseMessages;
  const maxPasses = 5;
  for (let pass = 0; pass < maxPasses; pass++) {
    if (pass > 0) {
      send({ type: "status", message: `Concept voortzetten (deel ${pass + 1})\u2026` });
    }
    for await (const chunk of streamChat(ai, messages, options)) {
      accumulated += chunk;
      send({ type: "delta", text: chunk, accumulated });
    }
    if (!needsContinuation(accumulated, request)) {
      return extractHtml(accumulated);
    }
    messages = [
      ...baseMessages,
      { role: "assistant", content: accumulated },
      { role: "user", content: buildContinuationPrompt(request, accumulated) }
    ];
  }
  if (accumulated.trim().startsWith("<article")) {
    const closed = `${accumulated.trim()}
</article>`;
    if (isArticleComplete(closed)) return closed;
  }
  throw new Error("Concept kon niet volledig worden afgerond. Probeer opnieuw te genereren.");
}
function buildChatMessages(request) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(request) }
  ];
}
function chatOptions(request) {
  return {
    maxTokens: 64e3,
    timeoutMs: 3e5,
    useThinking: false,
    effort: request.stage === "goud" ? "xhigh" : "high"
  };
}
function handleWriteDraftStreamRequest(request, ai) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (payload) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}

`));
      };
      try {
        const html = await streamDraftToCompletion(ai, request, send);
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
async function generateDraftWithAi(request, ai) {
  let accumulated = "";
  const options = chatOptions(request);
  const baseMessages = buildChatMessages(request);
  let messages = baseMessages;
  for (let pass = 0; pass < 5; pass++) {
    const chunk = await completeChat(ai, messages, options);
    accumulated += chunk;
    if (!needsContinuation(accumulated, request)) break;
    messages = [
      ...baseMessages,
      { role: "assistant", content: accumulated },
      { role: "user", content: buildContinuationPrompt(request, accumulated) }
    ];
  }
  return {
    html: extractHtml(accumulated),
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
    const ai = resolveAiFromRequest(request.ai, "WRITER_MODEL");
    if (request.stream) {
      return handleWriteDraftStreamRequest(request, ai);
    }
    const result = await generateDraftWithAi(request, ai);
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
  maxDuration: 300
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

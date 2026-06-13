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

// api-src/company-enrich.ts
var company_enrich_exports = {};
__export(company_enrich_exports, {
  config: () => config,
  default: () => handler
});
module.exports = __toCommonJS(company_enrich_exports);

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

// api-src/_lib/companyEnrich.ts
var USER_AGENT = "BesteedHetUit-CompanyEnrich/1.0";
var MAX_SOURCE_CHARS = 24e3;
var EMPTY_FIELDS = {
  name: "",
  tagline: "",
  kvk: "",
  website: "",
  contactEmail: "",
  profile: "",
  competencies: "",
  usps: "",
  references: ""
};
function normalizeWebsite(input) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Vul eerst een website in.");
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Alleen http- en https-adressen zijn toegestaan.");
  }
  return url.toString();
}
function trimSource(text, max = MAX_SOURCE_CHARS) {
  const cleaned = text.replace(/\u0000/g, "").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max)}

[tekst ingekort]`;
}
function htmlToText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
async function fetchText(url, init) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/plain, text/html, application/xhtml+xml",
      ...init?.headers ?? {}
    },
    signal: init?.signal ?? AbortSignal.timeout(12e3)
  });
  if (!response.ok) {
    throw new Error(`Bron niet bereikbaar (${response.status}): ${url}`);
  }
  return response.text();
}
async function readWebsiteContent(website) {
  try {
    const jinaUrl = `https://r.jina.ai/${website}`;
    const text2 = trimSource(await fetchText(jinaUrl));
    if (text2.length > 120) {
      return { source: website, text: `Website (${website}):
${text2}` };
    }
  } catch {
  }
  const html = await fetchText(website, { headers: { Accept: "text/html" } });
  const text = trimSource(htmlToText(html));
  return { source: website, text: `Website (${website}):
${text}` };
}
async function searchWeb(query) {
  try {
    const searchUrl = `https://s.jina.ai/${encodeURIComponent(query)}`;
    const text = trimSource(await fetchText(searchUrl), 8e3);
    if (!text.trim()) return null;
    return {
      source: `websearch:${query}`,
      text: `Websearch (${query}):
${text}`
    };
  } catch {
    return null;
  }
}
function resolveAiConfig(request) {
  return resolveAiFromRequest(request.ai, "COMPANY_ENRICH_MODEL");
}
var SYSTEM_PROMPT = `Je extraheert bedrijfsgegevens voor een Nederlandse inschrijving.
Regels:
- Gebruik uitsluitend feiten die expliciet in de bronnen staan.
- Verz\xEDn niets, extrapoleer niet en voeg geen marketingtaal toe.
- Laat velden leeg ("") als de informatie niet hard te herleiden is.
- KVK alleen invullen als een 8-cijferig nummer expliciet genoemd wordt.
- E-mail alleen invullen als die letterlijk in de bron staat.
- Tagline = korte positionering indien expliciet vermeld, anders leeg.
- Profiel = feitelijke beschrijving van activiteiten/organisatie.
- Kerncompetenties = feitelijke diensten/specialismen, komma-gescheiden.
- USP's = alleen als expliciet genoemde onderscheidende punten; geen aannames.
- Referenties = alleen genoemde klanten/projecten/cases met concrete feiten.
Antwoord uitsluitend met geldig JSON in dit schema:
{
  "name": "",
  "tagline": "",
  "kvk": "",
  "website": "",
  "contactEmail": "",
  "profile": "",
  "competencies": "",
  "usps": "",
  "references": "",
  "notes": ""
}`;
async function extractFactsWithAi(ai, website, sourcesText) {
  const content = await completeChat(
    ai,
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Website URL: ${website}

Bronnen:
${sourcesText}`
      }
    ],
    { jsonMode: ai.provider !== "anthropic", maxTokens: 4e3, timeoutMs: 6e4 }
  );
  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("AI gaf geen geldig JSON-resultaat terug. Probeer opnieuw.");
  }
  return {
    fields: {
      name: parsed.name?.trim() ?? "",
      tagline: parsed.tagline?.trim() ?? "",
      kvk: parsed.kvk?.trim() ?? "",
      website: parsed.website?.trim() || website,
      contactEmail: parsed.contactEmail?.trim() ?? "",
      profile: parsed.profile?.trim() ?? "",
      competencies: parsed.competencies?.trim() ?? "",
      usps: parsed.usps?.trim() ?? "",
      references: parsed.references?.trim() ?? ""
    },
    notes: parsed.notes?.trim() ?? ""
  };
}
async function enrichCompanyFromWebsite(request) {
  const website = normalizeWebsite(request.website);
  const ai = resolveAiConfig(request);
  const hostname = new URL(website).hostname.replace(/^www\./, "");
  const sourceBlocks = [];
  const searchQueries = [
    `${hostname} kvk bedrijfsgegevens`,
    `${hostname} bedrijf Nederland`
  ];
  const results = await Promise.allSettled([
    readWebsiteContent(website),
    ...searchQueries.map((query) => searchWeb(query))
  ]);
  for (const result of results) {
    if (result.status !== "fulfilled" || !result.value) continue;
    sourceBlocks.push(result.value);
  }
  if (!sourceBlocks.some((block) => block.source === website)) {
    throw new Error(`Kon de website ${website} niet bereiken. Controleer het adres.`);
  }
  const sources = sourceBlocks.map((block) => block.source);
  const sourcesText = sourceBlocks.map((block) => block.text).join("\n\n---\n\n");
  if (!sourcesText.trim()) {
    return {
      fields: { ...EMPTY_FIELDS, website },
      sources,
      notes: "Geen bruikbare bronnen gevonden."
    };
  }
  const { fields, notes } = await extractFactsWithAi(ai, website, sourcesText);
  return {
    fields: { ...EMPTY_FIELDS, ...fields, website: fields.website || website },
    sources,
    notes
  };
}
async function handleCompanyEnrichRequest(body) {
  try {
    const request = body ?? {};
    const result = await enrichCompanyFromWebsite(request);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout bij ophalen van bedrijfsgegevens.";
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

// api-src/company-enrich.ts
var config = {
  maxDuration: 60
};
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const response = await handleCompanyEnrichRequest(parseJsonBody(req.body));
    await sendWebResponse(res, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interne serverfout bij ophalen van bedrijfsgegevens.";
    res.status(500).json({ error: message });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  config
});

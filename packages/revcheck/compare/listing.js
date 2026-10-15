"use strict";
// Reads one used-car listing from mobile.bg or cars.bg, plus up to 3 pages
// of similar mobile.bg listings. Both sites refuse requests from
// DigitalOcean, so pages are fetched through the RevCheck reader Worker on
// Cloudflare (cloudflare/reader). siteOf() is the allowlist for visitor
// URLs; the Worker enforces its own copy.

const USER_AGENT = "RevCheck/0.1 (+https://github.com/GeorgievAlex/revcheck)";
const SEARCH_PAGES = 3;
const BGN_PER_EUR = 1.95583;
const MAX_PHOTOS = 24;
const MULTI_WORD_MAKES = ["alfa romeo", "aston martin", "land rover", "mercedes-benz", "rolls-royce"];

function siteOf(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^www\./, "");
  if (host === "mobile.bg" && /^\/obiava-\d+/.test(url.pathname)) {
    return { site: "mobile", url: `https://www.mobile.bg${url.pathname}` };
  }
  if (host === "cars.bg" && /^\/offer\/[0-9a-f]{24}$/.test(url.pathname)) {
    return { site: "cars", url: `https://www.cars.bg${url.pathname}` };
  }
  return null;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function text(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<sup>.*?<\/sup>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

const digits = (s) => {
  const n = Number(String(s || "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

// "8 947.61 €", "8,300 EUR", "17 500 лв." -> euros
function parsePrice(s) {
  // Thousands groups only ("8 947", "8,300"), so "Q5 4×4, 8300 EUR" can't
  // glue the 4 onto the price; cents are dropped.
  const m = String(s || "").match(/(\d{1,3}(?:[  ,.]\d{3})+|\d+)(?:[.,]\d{1,2})?\s*(€|EUR|лв|BGN)/i);
  if (!m) return null;
  const amount = Number(m[1].replace(/[^\d]/g, ""));
  if (!amount) return null;
  return /лв|BGN/i.test(m[2]) ? Math.round(amount / BGN_PER_EUR) : amount;
}

function splitMakeModel(title) {
  const t = String(title || "").trim();
  const lower = t.toLowerCase();
  const multi = MULTI_WORD_MAKES.find((m) => lower.startsWith(m + " ") || lower.startsWith(m.replace("-", " ") + " "));
  const makeLen = multi ? multi.length : t.split(/\s+/)[0].length;
  const make = t.slice(0, makeLen);
  const model = (t.slice(makeLen).trim().split(/\s+/)[0] || "").replace(/[,]$/, "");
  return { make, model };
}

// A VIN is 17 characters, no I, O or Q, and always mixes letters and digits.
function findVin(s) {
  for (const m of String(s || "").toUpperCase().matchAll(/\b[A-HJ-NPR-Z0-9]{17}\b/g)) {
    if (/[A-Z]/.test(m[0]) && /\d/.test(m[0])) return m[0];
  }
  return null;
}

const FUELS = ["Дизел", "Бензин", "Хибрид", "Електричество", "Газ", "Метан", "Plug-in"];

function normalizeFuel(s) {
  const f = String(s || "").toLowerCase();
  if (f.includes("plug")) return "plug-in hybrid";
  if (f.includes("хибрид")) return "hybrid";
  if (f.includes("дизел")) return "diesel";
  if (f.includes("електр")) return "electric";
  if (f.includes("бензин") || f.includes("газ") || f.includes("метан")) return "petrol";
  return null;
}

const normalizeGearbox = (s) => (/автомат/i.test(s || "") ? "automatic" : /ръчн/i.test(s || "") ? "manual" : null);

function parseMobile(html, url) {
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<div class="obiava"/) || [])[1];
  const title = text(h1);
  const params = {};
  for (const m of html.matchAll(/<div class="item[^"]*">\s*<div(?: class="mpLabel")?>([^<]+)<\/div>\s*<div(?: class="mpInfo")?>([\s\S]*?)<\/div>/g)) {
    params[text(m[1])] = text(m[2]);
  }
  const get = (prefix) => Object.entries(params).find(([k]) => k.startsWith(prefix))?.[1] || null;
  // Bounded by the next section rather than by counting </div>s.
  const extrasStart = html.indexOf('<div class="carExtri">');
  const extrasEnd = extrasStart === -1 ? -1 : html.indexOf('<div class="borderBox', extrasStart);
  const extrasBlock = extrasStart === -1 ? "" : html.slice(extrasStart, extrasEnd === -1 ? extrasStart + 20000 : extrasEnd);
  const extras = [...extrasBlock.matchAll(/<div(?: data-title="[^"]*")?>([^<]+)<\/div>/g)].map((m) => text(m[1])).filter(Boolean);
  const descBlock = (html.match(/<div class="moreInfo">[\s\S]*?<div class="text">([\s\S]*?)(?:<div class="viewSites"|<\/div>)/) || [])[1];
  const id = (url.match(/obiava-(\d+)/) || [])[1];
  const photos = [...new Set([...html.matchAll(/\/\/(mobistatic\d\.focus\.bg|cdn\d\.focus\.bg)\/mobile\/photosorg\/(\d+\/\d+)\/(?:big\/)?(\d+_\w+\.webp)/g)]
    .filter((m) => m[3].startsWith(id))
    .map((m) => `https://${m[1]}/mobile/photosorg/${m[2]}/big/${m[3]}`))];
  const breadcrumb = [...html.matchAll(/href="(?:https:)?\/\/www\.mobile\.bg\/obiavi\/avtomobili-dzhipove\/([a-z0-9-]+(?:\/[a-z0-9-]+)?)"/g)].map((m) => m[1]);
  const searchPath = breadcrumb.sort((a, b) => b.length - a.length)[0] || null;
  const year = digits((get("Дата на производство") || "").match(/(19|20)\d{2}/)?.[0]);
  return {
    site: "mobile.bg",
    url,
    title,
    ...splitMakeModel(title),
    price_eur: parsePrice((html.match(/<div class="Price">\s*([^<]+)/) || [])[1]),
    year,
    km: digits(get("Пробег")),
    fuel: normalizeFuel(get("Двигател")),
    gearbox: normalizeGearbox(get("Скоростна кутия")),
    power_hp: digits(get("Мощност")),
    engine_cc: digits(get("Кубатура")),
    body: get("Категория"),
    color: get("Цвят"),
    location: text((html.match(/<div class="carLocation">([\s\S]*?)<\/div>/) || [])[1]).replace(/^Намира се в\s*/, "") || null,
    extras,
    description: text(descBlock).slice(0, 3000),
    vin: findVin(text(descBlock)) || findVin((html.match(/VIN[^<]{0,40}/i) || [])[0]),
    photos: photos.slice(0, MAX_PHOTOS),
    search_path: searchPath && searchPath.includes("/") ? searchPath : null,
  };
}

function parseCars(html, url) {
  const ogTitle = text((html.match(/<meta property="og:title" content="([^"]*)"/) || [])[1]);
  const title = text((html.match(/<h2>([\s\S]*?)<\/h2>/) || [])[1]) || ogTitle.replace(/^CARS\.BG - /, "").split(",")[0];
  const summary = text((html.match(/<h2>[\s\S]*?<\/h2>\s*<\/div>\s*<div class="text-copy"[^>]*>([\s\S]*?)<\/div>/) || [])[1]);
  const parts = summary.split(/\s*,\s*/);
  const extrasBlock = (html.match(/<h4>Особености и Екстри<\/h4>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/) || [])[1] || "";
  const extras = [...extrasBlock.matchAll(/<strong>[^<]*<\/strong>([^<]*)/g)]
    .flatMap((m) => text(m[1]).split(/\s*,\s*/))
    .filter(Boolean);
  const notes = text((html.match(/<div class="offer-notes">([\s\S]*?)<\/div>/) || [])[1]);
  const photos = [...new Set([...html.matchAll(/https:\/\/(g\d-bg\.cars\.bg\/[\w-]+\/[0-9a-f]+)[bo]\.jpg/g)].map((m) => `https://${m[1]}o.jpg`))];
  const fuelPart = parts.find((p) => FUELS.some((f) => p.startsWith(f)));
  return {
    site: "cars.bg",
    url,
    title,
    ...splitMakeModel(title),
    price_eur: parsePrice(ogTitle),
    year: digits(summary.match(/\b(19|20)\d{2}\b/)?.[0]),
    km: digits(summary.match(/([\d\s]+)\s*км/)?.[1]),
    fuel: normalizeFuel(fuelPart),
    gearbox: normalizeGearbox(parts.find((p) => /скорости/i.test(p))),
    power_hp: digits(summary.match(/(\d+)\s*к\.с\./)?.[1]),
    engine_cc: digits(summary.match(/(\d+)\s*см/)?.[1]),
    body: parts[1] || null,
    color: parts.length > 3 && !/врати|см|EURO/i.test(parts[parts.length - 1]) ? parts[parts.length - 1] : null,
    location: null,
    extras,
    description: notes.slice(0, 3000),
    vin: findVin(notes),
    photos: photos.slice(0, MAX_PHOTOS),
    search_path: null,
  };
}

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// mobile.bg filters search results by body type and fuel in the path, e.g.
// /bmw/320/kombi/dizelov/ot-2012/do-2014. Plug-in hybrids have no filter.
const BODY_SLUGS = { Седан: "sedan", Комби: "kombi", Хечбек: "hechbek", Купе: "kupe", Кабрио: "kabrio", Джип: "dzhip", Ван: "van", Миниван: "minivan", Пикап: "pikap" };
const FUEL_SLUGS = { diesel: "dizelov", petrol: "benzinov", hybrid: "hibriden", electric: "elektricheski" };

function searchPath(listing) {
  const model = modelPath(listing);
  return model ? [model, BODY_SLUGS[listing.body], FUEL_SLUGS[listing.fuel]].filter(Boolean).join("/") : null;
}

function modelPath(listing) {
  if (listing.search_path) return listing.search_path;
  const make = slug(listing.make);
  const model = slug(listing.model);
  return make && model ? `${make}/${model}` : null;
}

const searchUrl = (path, year, page) =>
  `https://www.mobile.bg/obiavi/avtomobili-dzhipove/${path}/ot-${year - 1}/do-${year + 1}${page > 1 ? `/p-${page}` : ""}`;

const MONTHS = /(януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември)\s+((?:19|20)\d{2})/;

function parseSearchCards(html) {
  const cards = html.split(/<div class="item /).slice(1);
  const rows = [];
  for (const card of cards) {
    const id = (card.match(/obiava-(\d+)/) || [])[1];
    const price = parsePrice(text((card.match(/<div class="price[^"]*">\s*<div>([^<]+)<\/div>/) || [])[1]));
    const spans = [...((card.match(/<div class="params">([\s\S]*?)<\/div>/) || [])[1] || "").matchAll(/<span>([^<]*)<\/span>/g)].map((m) => text(m[1]));
    const find = (re) => spans.find((s) => re.test(s));
    const num = (re) => {
      const s = find(re);
      return s ? Number(s.replace(/[^\d]/g, "")) || null : null;
    };
    const year = Number((find(MONTHS) || "").match(MONTHS)?.[2]) || null;
    if (!id || !price || !year) continue;
    const fuel = find(/Дизел|Бензин|Хибрид|Електр|Газ/);
    rows.push({
      id,
      title: text((card.match(/class="title[^"]*">([^<]+)</) || [])[1]),
      price_eur: price,
      year,
      km: num(/км$/),
      power_hp: num(/к\.с\.$/),
      engine_cc: num(/куб\.см$/),
      fuel: fuel ? (/Дизел/.test(fuel) ? "diesel" : /Хибрид/.test(fuel) ? "hybrid" : /Електр/.test(fuel) ? "electric" : "petrol") : null,
      gearbox: find(/Автоматична/) ? "automatic" : find(/Ръчна/) ? "manual" : null,
    });
  }
  return rows;
}

// Returns read(url) -> page text. Through the reader Worker when READER_URL
// is set (production), straight from this machine otherwise (local runs).
function pageReader(env, fetchImpl) {
  return async (url) => {
    const res = env.READER_URL
      ? await fetchImpl(`${env.READER_URL}?url=${encodeURIComponent(url)}`, { headers: { "X-Reader-Secret": env.READER_SECRET || "" } })
      : await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    // mobile.bg still serves windows-1251; cars.bg is UTF-8.
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
    const charset = ((res.headers.get("content-type") || "").match(/charset=([\w-]+)/i) || head.match(/charset=["']?([\w-]+)/i) || [])[1] || "utf-8";
    return new TextDecoder(/1251/.test(charset) ? "windows-1251" : "utf-8").decode(bytes);
  };
}

// One car: its listing, plus similar mobile.bg listings (same make/model,
// body type and fuel, year ±1). cars.bg listings are matched against
// mobile.bg too: cars.bg search needs ids its listing pages don't expose.
async function gatherCar(target, read) {
  const html = await read(target.url);
  const listing = target.site === "mobile" ? parseMobile(html, target.url) : parseCars(html, target.url);
  if (!listing.title || !listing.price_eur) throw new Error("couldn't read the listing (it may have been removed)");
  const path = searchPath(listing);
  if (!path || !listing.year) return { listing, comparables: [], search_url: null };
  const pages = await Promise.all(Array.from({ length: SEARCH_PAGES }, (_, i) => read(searchUrl(path, listing.year, i + 1)).catch(() => "")));
  const ownId = (target.url.match(/obiava-(\d+)/) || [])[1];
  const seen = new Set();
  const comparables = pages.flatMap(parseSearchCards).filter((r) => r.id !== ownId && !seen.has(r.id) && seen.add(r.id));
  return { listing, comparables, search_url: searchUrl(path, listing.year, 1) };
}

module.exports = { siteOf, text, parsePrice, splitMakeModel, findVin, parseMobile, parseCars, searchPath, searchUrl, parseSearchCards, pageReader, gatherCar, BGN_PER_EUR };

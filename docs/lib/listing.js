// Parses mobile.bg and cars.bg pages into plain listing data. Runs in the
// visitor's browser: both sites refuse requests from cloud servers, so the
// RevCheck Reader extension fetches the pages and this module reads them.
// siteOf() is the allowlist; the extension enforces its own copy.

const BGN_PER_EUR = 1.95583;
const MAX_PHOTOS = 6;
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

function searchPath(listing) {
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

export { siteOf, text, parsePrice, splitMakeModel, findVin, parseMobile, parseCars, searchPath, searchUrl, parseSearchCards, BGN_PER_EUR };

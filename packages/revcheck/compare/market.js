"use strict";
// Where a listing sits in the market. Comparables come from mobile.bg search
// result cards (same make/model, year ±1), which already carry price, year,
// km, power and gearbox, so one request yields ~20 rows. cars.bg listings are
// matched against mobile.bg too: its search needs internal brand/model ids
// that the listing page doesn't expose.

const { fetchText, text, parsePrice } = require("./listing.js");

const MAX_PAGES = 3;
const MIN_FOR_PERCENTILE = 5;
const MIN_FOR_TABPFN = 15;
const TABPFN_URL = "https://api.priorlabs.ai";
const FEATURES = ["year", "km", "power_hp", "engine_cc", "fuel", "gearbox"];

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

async function findComparables(listing, fetchImpl) {
  const path = searchPath(listing);
  if (!path || !listing.year) return { search_url: null, rows: [] };
  const pages = await Promise.all(
    Array.from({ length: MAX_PAGES }, (_, i) => fetchText(searchUrl(path, listing.year, i + 1), fetchImpl).catch(() => "")),
  );
  const seen = new Set();
  const ownId = (listing.url.match(/obiava-(\d+)/) || [])[1];
  const rows = pages.flatMap(parseSearchCards).filter((r) => {
    if (seen.has(r.id) || r.id === ownId) return false;
    seen.add(r.id);
    // Same fuel when both sides know it: a 320d and a 320i are different markets.
    return !(listing.fuel && r.fuel && listing.fuel !== r.fuel);
  });
  // Leasing ads ("от 186 €/месец") and parts cars list far below the market.
  const mid = median(rows.map((r) => r.price_eur));
  const real = rows.filter((r) => r.price_eur >= mid * 0.35 && !/лизинг по|на части|за части/i.test(r.title));
  return { search_url: searchUrl(path, listing.year, 1), rows: real };
}

// Share of comparables priced at or below this one, 0-100.
function pricePercentile(price, prices) {
  if (!price || prices.length < MIN_FOR_PERCENTILE) return null;
  return Math.round((prices.filter((p) => p <= price).length / prices.length) * 100);
}

function median(values) {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

// --- TabPFN (Prior Labs JSON API): upload train set -> fit -> upload test set -> predict ---

const csvCell = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const toCsv = (header, rows) => [header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n";

// Long fits stream keepalive whitespace before the JSON, so read text and trim.
async function priorlabs(path, body, key, fetchImpl) {
  const res = await fetchImpl(`${TABPFN_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = (await res.text()).trim();
  if (!res.ok) throw new Error(`TabPFN ${path} ${res.status}`);
  return JSON.parse(raw);
}

async function upload(info, csv, fetchImpl) {
  const res = await fetchImpl(info.signed_urls[0], { method: "PUT", headers: info.required_headers || {}, body: csv });
  if (!res.ok) throw new Error(`TabPFN upload ${res.status}`);
}

// Fair price range for one car, learned from its own comparables. Quantiles
// rather than a point estimate: "€8,100-9,600" is honest, "€8,847" isn't.
async function fairPrice(listing, rows, key, fetchImpl) {
  if (!key || rows.length < MIN_FOR_TABPFN) return null;
  const features = (r) => FEATURES.map((f) => r[f]);
  const prep = await priorlabs("/tabpfn/prepare_train_set_upload", { x_train_info: { format: "csv" }, y_train_info: { format: "csv" } }, key, fetchImpl);
  await Promise.all([
    upload(prep.x_train_info, toCsv(FEATURES, rows.map(features)), fetchImpl),
    upload(prep.y_train_info, toCsv(["price_eur"], rows.map((r) => [r.price_eur])), fetchImpl),
  ]);
  const fit = await priorlabs(
    "/tabpfn/fit",
    { train_set_upload_id: prep.train_set_upload_id, task_config: { task: "regression", tabpfn_config: { model_path: "v3.5_default" } } },
    key,
    fetchImpl,
  );
  const test = await priorlabs("/tabpfn/prepare_test_set_upload", { fitted_train_set_id: fit.fitted_train_set_id, x_test_info: { format: "csv" } }, key, fetchImpl);
  await upload(test.x_test_info, toCsv(FEATURES, [features(listing)]), fetchImpl);
  const out = await priorlabs(
    "/tabpfn/predict",
    {
      test_set_upload_id: test.test_set_upload_id,
      fitted_train_set_id: fit.fitted_train_set_id,
      task_config: { task: "regression", predict_params: { output_type: "quantiles", quantiles: [0.1, 0.5, 0.9] } },
    },
    key,
    fetchImpl,
  );
  const [low, mid, high] = quantileRow(out.prediction).map((v) => Math.round(Number(v)));
  if (![low, mid, high].every(Number.isFinite)) throw new Error("TabPFN returned no usable quantiles");
  return { low, mid, high, trained_on: rows.length, delta_eur: listing.price_eur - mid };
}

// The API returns quantiles either per quantile ([[q10s], [q50s], [q90s]])
// or keyed by name; one test row means each inner array has one value.
function quantileRow(prediction) {
  const p = prediction && !Array.isArray(prediction) ? prediction.quantiles || Object.values(prediction)[0] : prediction;
  if (!Array.isArray(p)) return [];
  if (p.length === 3 && Array.isArray(p[0])) return p.map((q) => q[0]);
  if (p.length === 1 && Array.isArray(p[0])) return p[0];
  return p;
}

async function marketFor(listing, { fetchImpl, tabpfnKey }) {
  const { search_url, rows } = await findComparables(listing, fetchImpl);
  const prices = rows.map((r) => r.price_eur);
  let fair = null;
  let fair_error = null;
  try {
    fair = await fairPrice(listing, rows, tabpfnKey, fetchImpl);
  } catch (e) {
    fair_error = e.message;
  }
  return {
    search_url,
    comparables: rows.length,
    percentile: pricePercentile(listing.price_eur, prices),
    median_eur: median(prices),
    min_eur: prices.length ? Math.min(...prices) : null,
    max_eur: prices.length ? Math.max(...prices) : null,
    fair,
    fair_error,
  };
}

module.exports = { searchPath, searchUrl, parseSearchCards, findComparables, pricePercentile, median, toCsv, quantileRow, fairPrice, marketFor };

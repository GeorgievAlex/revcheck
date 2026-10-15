"use strict";
// Where a listing sits in the market, from comparable mobile.bg listings the
// visitor's browser collected (same make/model, year ±1): the percentile, the
// range, and a TabPFN fair-price range trained on those rows.

const MIN_FOR_PERCENTILE = 5;
const MIN_FOR_TABPFN = 15;
const TABPFN_URL = "https://api.priorlabs.ai";
const FEATURES = ["year", "km", "power_hp", "engine_cc", "fuel", "gearbox"];

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

// Same fuel when both sides know it (a 320d and a 320i are different
// markets), and no leasing ads or parts cars, which list far below the market.
// Then the same engine variant: power within ±10% (a 163 hp and a 184 hp 320d
// price differently), or engine size when the listing has no power figure.
// That last step is skipped when it would leave too few cars to compare.
const MIN_AFTER_ENGINE_MATCH = 8;

function cleanComparables(listing, rows) {
  const sameFuel = rows.filter((r) => !(listing.fuel && r.fuel && listing.fuel !== r.fuel));
  const mid = median(sameFuel.map((r) => r.price_eur));
  const real = sameFuel.filter((r) => r.price_eur >= mid * 0.35 && !/лизинг по|на части|за части/i.test(r.title || ""));
  let engine = null;
  let test = null;
  if (listing.power_hp) {
    engine = { by: "power_hp", value: listing.power_hp };
    test = (r) => r.power_hp && Math.abs(r.power_hp - listing.power_hp) <= listing.power_hp * 0.1;
  } else if (listing.engine_cc) {
    engine = { by: "engine_cc", value: listing.engine_cc };
    test = (r) => r.engine_cc && Math.abs(r.engine_cc - listing.engine_cc) <= 150;
  }
  const sameEngine = test ? real.filter(test) : [];
  return sameEngine.length >= MIN_AFTER_ENGINE_MATCH ? { rows: sameEngine, engine } : { rows: real, engine: null };
}

async function marketFor(listing, comparables, searchUrl, { fetchImpl, tabpfnKey }) {
  const { rows, engine } = cleanComparables(listing, comparables);
  const prices = rows.map((r) => r.price_eur);
  let fair = null;
  let fair_error = null;
  try {
    fair = await fairPrice(listing, rows, tabpfnKey, fetchImpl);
  } catch (e) {
    fair_error = e.message;
  }
  return {
    search_url: searchUrl,
    comparables: rows.length,
    engine_matched: engine,
    percentile: pricePercentile(listing.price_eur, prices),
    median_eur: median(prices),
    min_eur: prices.length ? Math.min(...prices) : null,
    max_eur: prices.length ? Math.max(...prices) : null,
    fair,
    fair_error,
  };
}

module.exports = { cleanComparables, pricePercentile, median, toCsv, quantileRow, fairPrice, marketFor };

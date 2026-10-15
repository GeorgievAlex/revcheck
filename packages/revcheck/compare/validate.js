"use strict";
// Listings are parsed from third-party HTML, so every field is untrusted:
// this module rebuilds each listing from checked fields only.
// Photo URLs matter most: Gemma fetches them, so only the two sites' image
// CDNs are accepted.

const MAX_COMPARABLES = 200;
const MAX_PHOTOS = 24;
const LISTING_URL = /^https:\/\/www\.(mobile\.bg\/obiava-\d+[\w-]*|cars\.bg\/offer\/[0-9a-f]{24})$/;
const SEARCH_URL = /^https:\/\/www\.(mobile\.bg\/obiavi\/avtomobili-dzhipove\/[a-z0-9-]+\/[a-z0-9-]+(\/[a-z-]+){0,2}\/ot-\d{4}\/do-\d{4}|cars\.bg\/carslist\.php\?[\w%.=&-]+)$/;
const PHOTO_URL = /^https:\/\/((mobistatic|cdn)\d\.focus\.bg\/mobile\/photosorg\/\d+\/\d+\/big\/\d+_\w+\.webp|g\d-bg\.cars\.bg\/[\w-]+\/[0-9a-f]+o\.jpg)$/;
const VIN = /^[A-HJ-NPR-Z0-9]{17}$/;
const FUELS = ["diesel", "petrol", "hybrid", "plug-in hybrid", "electric"];
const GEARBOXES = ["manual", "automatic"];

class InputError extends Error {}

const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const int = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
const oneOf = (v, list) => (list.includes(v) ? v : null);

function listing(raw, label) {
  if (!raw || typeof raw !== "object") throw new InputError(`Listing ${label} is missing.`);
  const url = typeof raw.url === "string" && LISTING_URL.test(raw.url) ? raw.url : null;
  if (!url) throw new InputError(`Listing ${label} must come from mobile.bg or cars.bg.`);
  const title = str(raw.title, 200);
  const price = int(raw.price_eur, 100, 5000000);
  if (!title || !price) throw new InputError(`Couldn't read listing ${label}. It may have been removed.`);
  return {
    site: url.includes("mobile.bg") ? "mobile.bg" : "cars.bg",
    url,
    title,
    make: str(raw.make, 40),
    model: str(raw.model, 40),
    price_eur: price,
    year: int(raw.year, 1950, 2100),
    km: int(raw.km, 0, 3000000),
    fuel: oneOf(raw.fuel, FUELS),
    gearbox: oneOf(raw.gearbox, GEARBOXES),
    power_hp: int(raw.power_hp, 1, 2000),
    engine_cc: int(raw.engine_cc, 1, 10000),
    body: str(raw.body, 40),
    color: str(raw.color, 40),
    location: str(raw.location, 80),
    extras: (Array.isArray(raw.extras) ? raw.extras : []).map((e) => str(e, 80)).filter(Boolean).slice(0, 80),
    description: str(raw.description, 3000) || "",
    vin: typeof raw.vin === "string" && VIN.test(raw.vin) ? raw.vin : null,
    photos: (Array.isArray(raw.photos) ? raw.photos : []).filter((p) => typeof p === "string" && PHOTO_URL.test(p)).slice(0, MAX_PHOTOS),
  };
}

function comparable(raw) {
  if (!raw || typeof raw !== "object") return null;
  const price = int(raw.price_eur, 100, 5000000);
  const year = int(raw.year, 1950, 2100);
  if (!price || !year) return null;
  return {
    title: str(raw.title, 200) || "",
    price_eur: price,
    year,
    km: int(raw.km, 0, 3000000),
    power_hp: int(raw.power_hp, 1, 2000),
    engine_cc: int(raw.engine_cc, 1, 10000),
    fuel: oneOf(raw.fuel, FUELS),
    gearbox: oneOf(raw.gearbox, GEARBOXES),
    body: str(raw.body, 40),
    source: oneOf(raw.source, ["mobile.bg", "cars.bg"]),
    engine_ok: raw.engine_ok === true || undefined,
  };
}

function car(raw, label) {
  const comps = Array.isArray(raw && raw.comparables) ? raw.comparables : [];
  if (comps.length > MAX_COMPARABLES) throw new InputError(`Too many comparables for listing ${label}.`);
  return {
    listing: listing(raw && raw.listing, label),
    comparables: comps.map(comparable).filter(Boolean),
    search_url: raw && typeof raw.search_url === "string" && SEARCH_URL.test(raw.search_url) ? raw.search_url : null,
  };
}

function cars(raw) {
  if (!Array.isArray(raw) || raw.length !== 2) throw new InputError("Send exactly two listings.");
  const out = [car(raw[0], "A"), car(raw[1], "B")];
  if (out[0].listing.url === out[1].listing.url) throw new InputError("Those are the same listing. Paste two different cars.");
  return out;
}

const comparables = (rows) => {
  if (!Array.isArray(rows)) return [];
  if (rows.length > MAX_COMPARABLES) throw new InputError("Too many comparables.");
  return rows.map(comparable).filter(Boolean);
};
const searchUrl = (u) => (typeof u === "string" && SEARCH_URL.test(u) ? u : null);

module.exports = { cars, listing, comparables, searchUrl, InputError, PHOTO_URL, LISTING_URL };

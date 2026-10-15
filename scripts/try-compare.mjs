// Runs a full comparison locally, skipping Turnstile. Reads keys from .env.
// Fetches the listings from this machine, like the Reader extension does in
// the browser (mobile.bg and cars.bg refuse cloud servers, not home connections).
//   node --env-file=.env scripts/try-compare.mjs <urlA> <urlB> [en|bg]
import { createRequire } from "node:module";
import { siteOf, parseMobile, parseCars, searchPath, searchUrl, parseSearchCards } from "../docs/lib/listing.js";

const require = createRequire(import.meta.url);
const { compare } = require("../packages/revcheck/compare/index.js");
const { cars } = require("../packages/revcheck/compare/validate.js");

async function read(url) {
  const res = await fetch(url, { headers: { "User-Agent": "RevCheck/0.1 (+https://github.com/GeorgievAlex/revcheck)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return new TextDecoder(/1251/.test(res.headers.get("content-type") || "") || url.includes("mobile.bg") ? "windows-1251" : "utf-8").decode(bytes);
}

async function gather(input) {
  const target = siteOf(input);
  if (!target) throw new Error(`not a mobile.bg or cars.bg listing: ${input}`);
  const html = await read(target.url);
  const listing = target.site === "mobile" ? parseMobile(html, target.url) : parseCars(html, target.url);
  const path = searchPath(listing);
  if (!path || !listing.year) return { listing, comparables: [], search_url: null };
  const pages = await Promise.all([1, 2, 3].map((p) => read(searchUrl(path, listing.year, p)).catch(() => "")));
  return { listing, comparables: pages.flatMap(parseSearchCards), search_url: searchUrl(path, listing.year, 1) };
}

const [a, b, lang = "en"] = process.argv.slice(2);
if (!a || !b) {
  console.error("usage: node --env-file=.env scripts/try-compare.mjs <urlA> <urlB> [en|bg]");
  process.exit(1);
}
const started = Date.now();
const { status, body } = await compare(cars(await Promise.all([gather(a), gather(b)])), lang, process.env, fetch);
console.log(JSON.stringify(body, null, 2));
console.error(`status ${status} in ${((Date.now() - started) / 1000).toFixed(1)}s`);

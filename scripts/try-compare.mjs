// Runs a full comparison locally, skipping Turnstile. Reads keys from .env.
// With READER_URL and READER_SECRET set it reads through the Cloudflare
// reader like production; without them it reads from this machine.
//   node --env-file=.env scripts/try-compare.mjs <urlA> <urlB> [en|bg]
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { compare } = require("../packages/revcheck/compare/index.js");
const { siteOf } = require("../packages/revcheck/compare/listing.js");

const [a, b, lang = "en"] = process.argv.slice(2);
const targets = [a, b].map((u) => u && siteOf(u));
if (!targets.every(Boolean)) {
  console.error("usage: node --env-file=.env scripts/try-compare.mjs <mobile.bg or cars.bg url A> <url B> [en|bg]");
  process.exit(1);
}
const started = Date.now();
const { status, body } = await compare(targets, lang, process.env, fetch);
console.log(JSON.stringify(body, null, 2));
console.error(`status ${status} in ${((Date.now() - started) / 1000).toFixed(1)}s`);

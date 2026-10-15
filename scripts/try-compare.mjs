// Runs a full comparison locally, skipping Turnstile. Reads keys from .env.
//   node --env-file=.env scripts/try-compare.mjs <urlA> <urlB> [en|bg]
import { createRequire } from "node:module";
const { compare } = createRequire(import.meta.url)("../packages/koyakola/compare/index.js");

const [a, b, lang = "en"] = process.argv.slice(2);
if (!a || !b) {
  console.error("usage: node --env-file=.env scripts/try-compare.mjs <urlA> <urlB> [en|bg]");
  process.exit(1);
}
const started = Date.now();
const { status, body } = await compare([a, b], lang, process.env, fetch);
console.log(JSON.stringify(body, null, 2));
console.error(`status ${status} in ${((Date.now() - started) / 1000).toFixed(1)}s`);

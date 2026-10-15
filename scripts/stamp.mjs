// Stamps docs/index.html's script and style URLs with the current commit, so
// browsers fetch fresh files after a deploy instead of a cached copy (GitHub
// Pages allows 10 minutes of caching) that may not match the function.
//   node scripts/stamp.mjs   (run before committing a docs/ change)
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const version = execSync("git rev-parse --short HEAD").toString().trim() + "-" + Date.now().toString(36);
const file = new URL("../docs/index.html", import.meta.url);
const html = readFileSync(file, "utf8").replace(/(href|src)="(style\.css|app\.js)(\?v=[\w-]+)?"/g, `$1="$2?v=${version}"`);
writeFileSync(file, html);
console.log(`stamped ${version}`);

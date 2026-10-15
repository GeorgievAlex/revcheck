// RevCheck reader: fetches mobile.bg and cars.bg pages for the RevCheck
// DigitalOcean function. Both sites refuse requests from DigitalOcean; from
// Cloudflare they answer. Requests identify themselves honestly (the
// RevCheck User-Agent here, plus the CF-Worker header Cloudflare adds), so
// either site can block this Worker with one rule, and if they do, we stop.
//
// Not a public proxy: callers must send the shared READER_SECRET, and only
// these pages can be fetched:
//   - a mobile.bg listing      https://www.mobile.bg/obiava-…
//   - a cars.bg listing        https://www.cars.bg/offer/…
//   - a mobile.bg search page  https://www.mobile.bg/obiavi/avtomobili-dzhipove/<make>/<model>[/<body>][/<fuel>]/ot-YYYY/do-YYYY[/p-1..3]

const USER_AGENT = "RevCheck/0.1 (+https://github.com/GeorgievAlex/revcheck)";
const ALLOWED = [
  /^https:\/\/www\.mobile\.bg\/obiava-\d+[\w-]*$/,
  /^https:\/\/www\.cars\.bg\/offer\/[0-9a-f]{24}$/,
  /^https:\/\/www\.mobile\.bg\/obiavi\/avtomobili-dzhipove\/[a-z0-9-]+\/[a-z0-9-]+(\/[a-z-]+){0,2}\/ot-\d{4}\/do-\d{4}(\/p-[1-3])?$/,
];

// Constant-time comparison, so the secret can't be guessed byte by byte.
function sameSecret(a, b) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export default {
  async fetch(request, env) {
    if (!env.READER_SECRET) return new Response("reader not configured", { status: 500 });
    if (request.method !== "GET") return new Response("GET only", { status: 405 });
    if (!sameSecret(request.headers.get("X-Reader-Secret") || "", env.READER_SECRET)) return new Response("forbidden", { status: 403 });
    const url = new URL(request.url).searchParams.get("url") || "";
    if (!ALLOWED.some((re) => re.test(url))) return new Response("only mobile.bg and cars.bg listing and search pages", { status: 400 });
    const upstream = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, redirect: "follow" });
    // Raw bytes and the original content type: mobile.bg is windows-1251,
    // which the caller decodes. Re-encoding here would garble it.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") || "text/html" },
    });
  },
};

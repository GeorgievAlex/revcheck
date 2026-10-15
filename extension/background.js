// RevCheck Reader: fetches mobile.bg and cars.bg pages for the RevCheck site,
// from your browser and your connection, because both sites refuse requests
// from cloud servers. It can only fetch these pages, read-only, without your
// cookies:
//   - a mobile.bg listing      https://www.mobile.bg/obiava-…
//   - a cars.bg listing        https://www.cars.bg/offer/…
//   - a mobile.bg search page  https://www.mobile.bg/obiavi/avtomobili-dzhipove/<make>/<model>/ot-YYYY/do-YYYY[/p-N]
// and only when asked by the RevCheck page (content.js).

const ALLOWED = [
  /^https:\/\/www\.mobile\.bg\/obiava-\d+[\w-]*$/,
  /^https:\/\/www\.cars\.bg\/offer\/[0-9a-f]{24}$/,
  /^https:\/\/www\.mobile\.bg\/obiavi\/avtomobili-dzhipove\/[a-z0-9-]+\/[a-z0-9-]+\/ot-\d{4}\/do-\d{4}(\/p-[1-3])?$/,
];

async function read(url) {
  const res = await fetch(url, { credentials: "omit", redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  // mobile.bg still serves windows-1251; cars.bg is UTF-8.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const charset = ((res.headers.get("content-type") || "").match(/charset=([\w-]+)/i) || head.match(/charset=["']?([\w-]+)/i) || [])[1] || "utf-8";
  return new TextDecoder(/1251/.test(charset) ? "windows-1251" : "utf-8").decode(bytes);
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !msg || msg.type !== "fetch") return false;
  if (typeof msg.url !== "string" || !ALLOWED.some((re) => re.test(msg.url))) {
    reply({ ok: false, error: "RevCheck Reader only reads mobile.bg and cars.bg listing and search pages." });
    return false;
  }
  read(msg.url).then(
    (html) => reply({ ok: true, html }),
    (e) => reply({ ok: false, error: e.message }),
  );
  return true; // reply asynchronously
});

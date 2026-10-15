import { FUNCTION_URL, TURNSTILE_SITEKEY } from "./config.js";
import { readerReady, readPage } from "./reader.js";
import { siteOf, parseMobile, parseCars, searchPath, searchUrl, parseSearchCards } from "./lib/listing.js";

const SEARCH_PAGES = 3;

const $ = (id) => document.getElementById(id);
const LANG_KEY = "revcheck-lang";

const T = {
  en: {
    h1: "Two listings. Which one is the better buy?",
    lede: "Paste two used-car listings from mobile.bg or cars.bg. Gemma 4, an open-weight model, looks at the photos for damage and equipment. The price is checked against similar cars for sale, with a fair-price range from TabPFN. Then you get a verdict and what to ask the seller.",
    labelA: "Listing A",
    labelB: "Listing B",
    go: "Compare",
    footer: "Your browser reads the two listings and similar cars, then sends that data to a DigitalOcean Function, which passes the photos to Gemma 4 on DigitalOcean Serverless Inference and the price data to TabPFN. Nothing is stored. Treat the result as a second opinion, not an inspection.",
    readerOk: "✓ RevCheck Reader is installed.",
    installTitle: "Install the RevCheck Reader extension (Chrome, Edge, Brave)",
    installWhy: "mobile.bg and cars.bg block requests from cloud servers, so RevCheck reads the listings from your own browser. The extension only fetches mobile.bg and cars.bg listing and search pages when you click Compare, without your cookies. It's about 60 lines of code.",
    step1: "Download revcheck-reader.zip",
    step1b: "and unzip it.",
    step2: "Open chrome://extensions and turn on Developer mode (top right).",
    step3: "Click \"Load unpacked\" and pick the unzipped folder.",
    step4: "Reload this page.",
    readCode: "Read the extension's code",
    reading: "Reading both listings and similar cars from your browser…",
    working: "Looking at the photos and checking the market. This takes about 20–40 seconds…",
    noReader: "Install the RevCheck Reader extension first (see below). mobile.bg and cars.bg block cloud servers, so the listings are read from your browser.",
    badLink: (l) => `${l} must be a mobile.bg or cars.bg listing link.`,
    sameLink: "Those are the same listing. Paste two different cars.",
    cantRead: (l, e) => `Couldn't read ${l} (${e}). Check the link opens in your browser.`,
    notConnected: "The comparer isn't connected yet (no function URL configured).",
    noBotCheck: "The bot check isn't configured yet.",
    botFailed: "The bot check couldn't load. Refresh the page to try again.",
    tickBox: "Tick the \"I'm human\" box first.",
    network: "Couldn't reach the comparer. Check your connection and try again.",
    better: "Better buy",
    even: "Too close to call",
    why: "Why",
    ask: "Ask the seller",
    watch: "Check in person",
    noVerdict: "The written verdict couldn't be generated this time, but the facts below are complete.",
    price: "Price",
    year: "Year",
    km: "Mileage",
    power: "Power",
    gearbox: "Gearbox",
    fuel: "Fuel",
    color: "Color",
    market: "Market position",
    percentile: (p, n) => `Priced higher than ${p}% of ${n} similar listings`,
    range: (min, med, max) => `Range ${min} – ${max}, median ${med}`,
    fewComps: (n) => `Only ${n} similar listings found, not enough to place the price.`,
    fair: (lo, hi, n) => `TabPFN fair range: ${lo} – ${hi} (trained on ${n} listings)`,
    over: (d) => `${d} above the expected price`,
    under: (d) => `${d} below the expected price`,
    seeComps: "See the similar listings",
    photos: "What the photos show",
    condition: { good: "Looks good", fair: "Some wear", poor: "Visible problems", unclear: "Photos don't tell" },
    colorSeen: (c, ok) => `Color in photos: ${c}${ok === false ? " (doesn't match the listing)" : ""}`,
    equipment: "Equipment seen",
    damage: "Damage seen",
    notVisible: "Claimed but not visible",
    concerns: "Worth checking",
    noPhotoRead: "The photo check didn't run for this car.",
    flags: "Checks",
    flag: {
      vin_present: (f) => `VIN in the listing (${f.vin}). Run it through a history check for mileage and accidents before you go.`,
      vin_missing: () => "No VIN in the listing. Ask for it and run a history check before viewing.",
      km_low: (f) => `Only ~${f.per_year.toLocaleString("en")} km a year. Possible, but ask for service records to back it up.`,
      km_high: (f) => `~${f.per_year.toLocaleString("en")} km a year, well above average.`,
      few_photos: (f) => `Only ${f.count} photo${f.count === 1 ? "" : "s"}. Ask for more, especially the sides and the dashboard with the engine running.`,
    },
    open: "Open listing",
    manual: "manual",
    automatic: "automatic",
    fuels: { diesel: "diesel", petrol: "petrol", hybrid: "hybrid", "plug-in hybrid": "plug-in hybrid", electric: "electric" },
  },
  bg: {
    h1: "Две обяви. Коя кола е по-добрата покупка?",
    lede: "Поставете две обяви за употребявани коли от mobile.bg или cars.bg. Gemma 4, модел с отворени тегла, преглежда снимките за щети и екстри. Цената се сравнява с подобни коли в продажба, с диапазон на справедлива цена от TabPFN. Накрая получавате препоръка и какво да попитате продавача.",
    labelA: "Обява A",
    labelB: "Обява Б",
    go: "Сравни",
    footer: "Браузърът ви чете двете обяви и подобни коли, след това праща данните към DigitalOcean Function, която подава снимките на Gemma 4 в DigitalOcean Serverless Inference и ценовите данни на TabPFN. Нищо не се пази. Приемайте резултата като второ мнение, не като оглед.",
    readerOk: "✓ RevCheck Reader е инсталирано.",
    installTitle: "Инсталирайте разширението RevCheck Reader (Chrome, Edge, Brave)",
    installWhy: "mobile.bg и cars.bg блокират заявки от облачни сървъри, затова RevCheck чете обявите от вашия браузър. Разширението чете само обяви и търсения в mobile.bg и cars.bg, когато натиснете Сравни, без вашите бисквитки. Около 60 реда код.",
    step1: "Изтеглете revcheck-reader.zip",
    step1b: "и го разархивирайте.",
    step2: "Отворете chrome://extensions и включете Developer mode (горе вдясно).",
    step3: "Натиснете \"Load unpacked\" и изберете разархивираната папка.",
    step4: "Презаредете тази страница.",
    readCode: "Вижте кода на разширението",
    reading: "Чета двете обяви и подобни коли от вашия браузър…",
    working: "Гледам снимките и проверявам пазара. Отнема около 20–40 секунди…",
    noReader: "Първо инсталирайте разширението RevCheck Reader (вижте по-долу). mobile.bg и cars.bg блокират облачни сървъри, затова обявите се четат от вашия браузър.",
    badLink: (l) => `${l} трябва да е линк към обява в mobile.bg или cars.bg.`,
    sameLink: "Това е една и съща обява. Поставете две различни коли.",
    cantRead: (l, e) => `Не успях да прочета ${l} (${e}). Проверете дали линкът се отваря.`,
    notConnected: "Сравнението още не е свързано (няма адрес на функцията).",
    noBotCheck: "Проверката за бот още не е настроена.",
    botFailed: "Проверката за бот не се зареди. Презаредете страницата.",
    tickBox: "Първо отметнете „Аз съм човек“.",
    network: "Няма връзка със сравнението. Проверете интернета и опитайте пак.",
    better: "По-добрата покупка",
    even: "Твърде близо, за да се избере",
    why: "Защо",
    ask: "Попитайте продавача",
    watch: "Проверете на място",
    noVerdict: "Този път не се получи писмена препоръка, но фактите по-долу са пълни.",
    price: "Цена",
    year: "Година",
    km: "Пробег",
    power: "Мощност",
    gearbox: "Скорости",
    fuel: "Гориво",
    color: "Цвят",
    market: "Позиция на пазара",
    percentile: (p, n) => `По-скъпа от ${p}% от ${n} подобни обяви`,
    range: (min, med, max) => `Диапазон ${min} – ${max}, медиана ${med}`,
    fewComps: (n) => `Намерени са само ${n} подобни обяви, не стигат за сравнение.`,
    fair: (lo, hi, n) => `Справедлива цена по TabPFN: ${lo} – ${hi} (по ${n} обяви)`,
    over: (d) => `${d} над очакваната цена`,
    under: (d) => `${d} под очакваната цена`,
    seeComps: "Вижте подобните обяви",
    photos: "Какво показват снимките",
    condition: { good: "Изглежда добре", fair: "Има износване", poor: "Видими проблеми", unclear: "Снимките не показват" },
    colorSeen: (c, ok) => `Цвят на снимките: ${c}${ok === false ? " (не съвпада с обявата)" : ""}`,
    equipment: "Видими екстри",
    damage: "Видими щети",
    notVisible: "Обявени, но не се виждат",
    concerns: "Да се провери",
    noPhotoRead: "Проверката на снимките не мина за тази кола.",
    flags: "Проверки",
    flag: {
      vin_present: (f) => `Има VIN в обявата (${f.vin}). Проверете историята за пробег и катастрофи преди оглед.`,
      vin_missing: () => "Няма VIN в обявата. Поискайте го и проверете историята преди оглед.",
      km_low: (f) => `Само ~${f.per_year.toLocaleString("bg")} км на година. Възможно е, но поискайте сервизна история.`,
      km_high: (f) => `~${f.per_year.toLocaleString("bg")} км на година, доста над средното.`,
      few_photos: (f) => `Само ${f.count} снимки. Поискайте още, особено страните и таблото със запален двигател.`,
    },
    open: "Отвори обявата",
    manual: "ръчни",
    automatic: "автоматични",
    fuels: { diesel: "дизел", petrol: "бензин", hybrid: "хибрид", "plug-in hybrid": "plug-in хибрид", electric: "ток" },
  },
};

// A remembered choice wins; otherwise follow the browser language.
let lang = (navigator.language || "").startsWith("bg") ? "bg" : "en";
try {
  lang = localStorage.getItem(LANG_KEY) || lang;
} catch {
  // Storage can be blocked; the browser language still applies.
}
if (!T[lang]) lang = "en";
let lastResult = null;

const t = () => T[lang];

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return node;
}

const eur = (n) => (n == null ? "–" : `€${Math.round(n).toLocaleString(lang === "bg" ? "bg" : "en")}`);
const list = (title, items, cls) => (items && items.length ? [el("h4", {}, title), el("ul", { class: cls }, items.map((s) => el("li", {}, s)))] : []);

function setStatus(text, isError = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", isError);
}

function applyLang() {
  document.documentElement.lang = lang;
  for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t()[node.dataset.i18n];
  $("lang-toggle").textContent = lang === "en" ? "БГ" : "EN";
  $("lang-toggle").setAttribute("aria-label", lang === "en" ? "Превключи на български" : "Switch to English");
  if (lastResult) render(lastResult);
}

$("lang-toggle").addEventListener("click", () => {
  lang = lang === "en" ? "bg" : "en";
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Remembering the choice is a convenience only.
  }
  applyLang();
});

function marketBlock(m) {
  const s = t();
  if (!m) return [];
  const out = [el("h4", {}, s.market)];
  if (m.percentile == null) out.push(el("p", { class: "muted" }, s.fewComps(m.comparables)));
  else {
    out.push(
      el("p", {}, s.percentile(m.percentile, m.comparables)),
      el("div", { class: "meter", role: "img", "aria-label": s.percentile(m.percentile, m.comparables) }, el("span", { style: `left:${m.percentile}%` })),
      el("p", { class: "muted small" }, s.range(eur(m.min_eur), eur(m.median_eur), eur(m.max_eur))),
    );
  }
  if (m.fair) {
    const d = m.fair.delta_eur;
    out.push(
      el("p", {}, s.fair(eur(m.fair.low), eur(m.fair.high), m.fair.trained_on)),
      el("p", { class: d > 0 ? "bad" : "good" }, d > 0 ? s.over(eur(d)) : s.under(eur(-d))),
    );
  }
  if (m.search_url) out.push(el("p", { class: "small" }, el("a", { href: m.search_url, rel: "noopener", target: "_blank" }, s.seeComps)));
  return out;
}

function visionBlock(v) {
  const s = t();
  if (!v) return [el("h4", {}, s.photos), el("p", { class: "muted" }, s.noPhotoRead)];
  return [
    el("h4", {}, s.photos),
    el("p", {}, el("span", { class: `pill ${v.condition}` }, s.condition[v.condition])),
    v.color_seen ? el("p", { class: v.color_matches_listing === false ? "bad" : "" }, s.colorSeen(v.color_seen, v.color_matches_listing)) : null,
    ...list(s.damage, v.damage, "bad"),
    ...list(s.notVisible, v.claimed_not_visible, "bad"),
    ...list(s.equipment, v.equipment_seen),
    ...list(s.concerns, v.concerns),
  ];
}

function carCard(x, label, watch, isWinner) {
  const s = t();
  const l = x.listing;
  const facts = [
    [s.year, l.year],
    [s.km, l.km != null ? `${l.km.toLocaleString(lang === "bg" ? "bg" : "en")} km` : null],
    [s.power, l.power_hp ? `${l.power_hp} hp` : null],
    [s.fuel, s.fuels[l.fuel] || l.fuel],
    [s.gearbox, l.gearbox ? s[l.gearbox] : null],
    [s.color, l.color],
  ].filter(([, v]) => v != null);
  return [
    el("p", { class: "car-label" }, `${label} · ${l.site}`, isWinner ? el("span", { class: "pill good" }, s.better) : null),
    l.photos[0] ? el("img", { class: "car-photo", src: l.photos[0], alt: l.title, loading: "lazy", referrerpolicy: "no-referrer" }) : null,
    el("h3", {}, l.title),
    el("p", { class: "car-price" }, eur(l.price_eur)),
    el("dl", { class: "facts" }, facts.map(([k, v]) => [el("dt", {}, k), el("dd", {}, String(v))])),
    ...marketBlock(x.market),
    ...visionBlock(x.vision),
    el("h4", {}, s.flags),
    el("ul", {}, x.flags.map((f) => el("li", {}, s.flag[f.code](f)))),
    ...list(s.watch, watch),
    el("p", {}, el("a", { class: "button ghost", href: l.url, rel: "noopener", target: "_blank" }, s.open)),
  ];
}

function render(data) {
  const s = t();
  const v = data.verdict;
  const winner = v && v.winner;
  $("verdict").replaceChildren(
    ...(v
      ? [
          el("p", { class: "car-label" }, winner === "even" ? s.even : `${s.better}: ${winner === "a" ? s.labelA : s.labelB}`),
          el("h2", {}, v.headline),
          ...list(s.why, v.why),
          ...list(s.ask, v.ask_seller),
        ]
      : [el("p", { class: "muted" }, s.noVerdict)]),
  );
  $("car-a").replaceChildren(...carCard(data.a, s.labelA, v && v.watch_out_a, winner === "a"));
  $("car-b").replaceChildren(...carCard(data.b, s.labelB, v && v.watch_out_b, winner === "b"));
  $("result").hidden = false;
}

// Cloudflare Turnstile: the function only does work for a request carrying a
// fresh token. Tokens are single-use, so the widget resets after every request.
let turnstileToken = "";
let turnstileWidget = null;

function setToken(token) {
  turnstileToken = token;
  $("go").disabled = !token;
}

function renderTurnstile() {
  turnstileWidget = window.turnstile.render("#turnstile", {
    sitekey: TURNSTILE_SITEKEY,
    action: "compare",
    size: window.innerWidth < 400 ? "compact" : "normal",
    theme: document.documentElement.dataset.theme === "light" ? "light" : "dark",
    callback: (token) => setToken(token),
    "expired-callback": () => setToken(""),
    "error-callback": () => {
      setToken("");
      setStatus(t().botFailed, true);
    },
  });
}

function resetTurnstile() {
  setToken("");
  if (window.turnstile && turnstileWidget !== null) window.turnstile.reset(turnstileWidget);
}

function loadTurnstile() {
  if (!TURNSTILE_SITEKEY) return setStatus(t().noBotCheck, true);
  window.onTurnstileLoad = renderTurnstile;
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
  script.async = true;
  document.head.append(script);
}

$("compare-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const s = t();
  if (!FUNCTION_URL) return setStatus(s.notConnected, true);
  if (!turnstileToken) return setStatus(s.tickBox, true);
  const targets = [$("url-a").value, $("url-b").value].map(siteOf);
  for (const [i, target] of targets.entries()) if (!target) return setStatus(s.badLink(i ? s.labelB : s.labelA), true);
  if (targets[0].url === targets[1].url) return setStatus(s.sameLink, true);
  if (!(await readerReady())) {
    $("install").open = true;
    return setStatus(s.noReader, true);
  }
  $("go").disabled = true;
  setStatus(s.reading);
  let gathered;
  try {
    gathered = await Promise.all(targets.map((target, i) => gatherCar(target).catch((e) => Promise.reject(new Error(s.cantRead(i ? s.labelB : s.labelA, e.message))))));
  } catch (e) {
    $("go").disabled = !turnstileToken;
    return setStatus(e.message, true);
  }
  setStatus(s.working);
  try {
    // text/plain keeps this a CORS simple request (no preflight).
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ cars: gathered, lang, turnstile: turnstileToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setStatus(data.error || `Error ${res.status}`, true);
    setStatus("");
    lastResult = data;
    render(data);
    $("result").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    setStatus(s.network, true);
  } finally {
    resetTurnstile();
  }
});

// One car: its listing, plus up to 3 pages of similar mobile.bg listings
// (same make/model, year ±1). Comparables come from mobile.bg for cars.bg
// listings too: cars.bg search needs ids its listing pages don't expose.
async function gatherCar(target) {
  const html = await readPage(target.url);
  const listing = target.site === "mobile" ? parseMobile(html, target.url) : parseCars(html, target.url);
  if (!listing.title || !listing.price_eur) throw new Error("no price or title on the page");
  const path = searchPath(listing);
  if (!path || !listing.year) return { listing, comparables: [], search_url: null };
  const pages = await Promise.all(
    Array.from({ length: SEARCH_PAGES }, (_, i) => readPage(searchUrl(path, listing.year, i + 1)).catch(() => "")),
  );
  const ownId = (target.url.match(/obiava-(\d+)/) || [])[1];
  const seen = new Set();
  const comparables = pages.flatMap(parseSearchCards).filter((r) => r.id !== ownId && !seen.has(r.id) && seen.add(r.id));
  return { listing, comparables, search_url: searchUrl(path, listing.year, 1) };
}

// ?a=…&b=… pre-fills the form, so a comparison link can be shared.
const params = new URLSearchParams(location.search);
if (params.get("a")) $("url-a").value = params.get("a");
if (params.get("b")) $("url-b").value = params.get("b");

applyLang();
loadTurnstile();
readerReady().then((ok) => {
  $("install").open = !ok;
  $("reader-ok").hidden = !ok;
});

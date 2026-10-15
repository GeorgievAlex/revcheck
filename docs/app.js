import { FUNCTION_URL, TURNSTILE_SITEKEY } from "./config.js";
import { relabelThemeToggle } from "./theme.js";


const $ = (id) => document.getElementById(id);
const LANG_KEY = "revcheck-lang";

const T = {
  en: {
    h1: "Two listings. Which one is the better buy?",
    lede: "Paste two used-car listings from mobile.bg or cars.bg. Gemma 4, an open-weight model, looks at the photos for damage and equipment. The price is checked against similar cars for sale, with a fair-price range from TabPFN. Then you get a verdict and what to ask the seller.",
    labelA: "Listing A",
    labelB: "Listing B",
    go: "Compare",
    footer: "The two links are sent to a DigitalOcean Function. It reads the public listings through a small Cloudflare Worker, sends the photos to Gemma 4 on DigitalOcean Serverless Inference and the price data to TabPFN. Nothing is stored. Treat the result as a second opinion, not an inspection.",
    working: "Reading both listings, looking at every photo and checking the market. This takes about 20–40 seconds…",
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
    otherLang: "This report was written in Bulgarian. Click Compare again for an English one.",
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
    seeComps: (site) => `See similar cars on ${site}`,
    bySite: (sites) => `Compared with ${sites}.`,
    matched: (e, y) => `Same model, body type and fuel, ${y && y.length === 2 ? `${y[0]}–${y[1]}` : "year ±1"}${e ? (e.by === "power_hp" ? `, ${e.value} hp ±10%` : `, ${e.value} cc ±150`) : ""}.`,
    photosChecked: (n, m) => `${n} of ${m} photos checked.`,
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
      us_import: () => "Imported from the USA or Canada. Run the VIN through a history check (Carfax, AutoCheck) for auction or accident records before you go.",
      odometer_check: (f) => `The dash in photo ${f.photo ?? "?"} seems to read ${f.seen_km.toLocaleString("en")} km, but the listing says ${f.listed_km.toLocaleString("en")} km. Photo readings can be wrong: check the odometer in person.`,
    },
    open: "Open listing",
    manual: "manual",
    automatic: "automatic",
    fuels: { diesel: "diesel", petrol: "petrol", hybrid: "hybrid", "plug-in hybrid": "plug-in hybrid", electric: "electric" },
  },
  bg: {
    h1: "Две обяви. Коя кола да вземете?",
    lede: "Поставете линковете на две обяви от mobile.bg или cars.bg. AI разглежда всички снимки за щети и екстри, сравнява цената с подобни коли на пазара и ви казва коя е по-добрата сделка и какво да питате продавача, преди да отидете на оглед.",
    labelA: "Обява A",
    labelB: "Обява Б",
    go: "Сравни",
    footer: "RevCheck чете само публичната информация от обявите. Снимките се анализират от Gemma 4 (отворен AI модел), а цената от TabPFN. Нищо не се записва. Отчетът е второ мнение и не замества огледа и проверката в сервиз.",
    working: "Чета обявите, разглеждам снимките и проверявам цените. Отнема около 20–40 секунди…",
    notConnected: "Услугата още не е свързана.",
    noBotCheck: "Защитата срещу ботове още не е настроена.",
    botFailed: "Защитата срещу ботове не се зареди. Презаредете страницата.",
    tickBox: "Първо отметнете „Аз съм човек“.",
    network: "Няма връзка с услугата. Проверете интернета и опитайте пак.",
    better: "По-добрият избор",
    even: "Няма ясен победител",
    why: "Защо",
    ask: "Какво да питате продавача",
    watch: "Какво да проверите на оглед",
    noVerdict: "Този път не успяхме да напишем препоръка, но данните по-долу са пълни.",
    otherLang: "Този отчет е написан на английски. Натиснете Сравни отново за отчет на български.",
    price: "Цена",
    year: "Година",
    km: "Пробег",
    power: "Мощност",
    gearbox: "Скорости",
    fuel: "Гориво",
    color: "Цвят",
    market: "Спрямо пазара",
    percentile: (p, n) => `По-скъпа от ${p}% от ${n} подобни коли в продажба`,
    range: (min, med, max) => `Цени от ${min} до ${max}, средно ${med}`,
    fewComps: (n) => `Намерихме само ${n} подобни коли, твърде малко за сравнение.`,
    fair: (lo, hi, n) => `Реална пазарна цена: ${lo} – ${hi} (TabPFN, по ${n} обяви)`,
    over: (d) => `${d} над пазарната цена`,
    under: (d) => `${d} под пазарната цена`,
    seeComps: (site) => `Виж подобните в ${site}`,
    bySite: (sites) => `Сравнено с ${sites}.`,
    matched: (e, y) => `Сравнено със същия модел, купе и гориво, ${y && y.length === 2 ? `${y[0]}–${y[1]} г.` : "година ±1"}${e ? (e.by === "power_hp" ? `, ${e.value} к.с. ±10%` : `, ${e.value} куб.см ±150`) : ""}.`,
    photosChecked: (n, m) => `Разгледани ${n} от ${m} снимки.`,
    photos: "Какво се вижда на снимките",
    condition: { good: "В добро състояние", fair: "С износване", poor: "С видими проблеми", unclear: "Не личи от снимките" },
    colorSeen: (c, ok) => `Цвят: ${c}${ok === false ? " (не съвпада с обявата)" : ""}`,
    equipment: "Екстри, които се виждат",
    damage: "Щети",
    notVisible: "Пише ги в обявата, но не се виждат",
    concerns: "За проверка",
    noPhotoRead: "Не успяхме да разгледаме снимките на тази кола.",
    flags: "Проверки",
    flag: {
      vin_present: (f) => `Има VIN в обявата (${f.vin}). Проверете историята за пробег и катастрофи преди оглед.`,
      vin_missing: () => "Няма VIN в обявата. Поискайте го и проверете историята преди оглед.",
      km_low: (f) => `Само ~${f.per_year.toLocaleString("bg")} км на година. Възможно е, но поискайте сервизна история.`,
      km_high: (f) => `~${f.per_year.toLocaleString("bg")} км на година, доста над средното.`,
      few_photos: (f) => `Само ${f.count} снимки. Поискайте още, особено страните и таблото със запален двигател.`,
      us_import: () => "Внос от САЩ или Канада. Проверете VIN номера в Carfax или AutoCheck за аукционна история и катастрофи преди оглед.",
      odometer_check: (f) => `Таблото на снимка ${f.photo ?? "?"} изглежда показва ${f.seen_km.toLocaleString("bg")} км, а в обявата пише ${f.listed_km.toLocaleString("bg")} км. Разчитането от снимка може да греши: проверете километража на място.`,
    },
    open: "Към обявата",
    manual: "ръчни",
    automatic: "автоматик",
    fuels: { diesel: "дизел", petrol: "бензин", hybrid: "хибрид", "plug-in hybrid": "plug-in хибрид", electric: "електрически" },
  },
};

// ?lang=bg in the link wins, then a remembered choice, then the browser language.
let lang = (navigator.language || "").startsWith("bg") ? "bg" : "en";
try {
  lang = localStorage.getItem(LANG_KEY) || lang;
} catch {
  // Storage can be blocked; the browser language still applies.
}
const linkLang = new URLSearchParams(location.search).get("lang");
if (linkLang) lang = linkLang;
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
  for (const button of document.querySelectorAll("[data-lang]")) button.setAttribute("aria-pressed", String(button.dataset.lang === lang));
  relabelThemeToggle();
  if (lastResult) render(lastResult);
}

document.querySelector(".lang-switch").addEventListener("click", (event) => {
  const choice = event.target.closest("[data-lang]");
  if (!choice || choice.dataset.lang === lang) return;
  lang = choice.dataset.lang;
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
  if (m.comparables) out.push(el("p", { class: "muted small" }, s.matched(m.engine_matched, m.years)));
  const siteOfUrl = (u) => (u.includes("cars.bg") ? "cars.bg" : "mobile.bg");
  const counts = Object.entries(m.by_site || {});
  if (counts.length > 1) out.push(el("p", { class: "muted small" }, s.bySite(counts.map(([site, n]) => `${n} × ${site}`).join(" + "))));
  const links = [m.search_url, m.other_search_url].filter(Boolean);
  if (links.length) out.push(el("p", { class: "small comp-links" }, links.map((u) => el("a", { href: u, rel: "noopener", target: "_blank" }, s.seeComps(siteOfUrl(u))))));
  return out;
}

function visionBlock(v) {
  const s = t();
  if (!v) return [el("h4", {}, s.photos), el("p", { class: "muted" }, s.noPhotoRead)];
  return [
    el("h4", {}, s.photos),
    el("p", {}, el("span", { class: `pill ${v.condition}` }, s.condition[v.condition])),
    v.photos_total ? el("p", { class: "muted small" }, s.photosChecked(v.photos_checked, v.photos_total)) : null,
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
    ...(data.lang && data.lang !== lang ? [el("p", { class: "muted small" }, s.otherLang)] : []),
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
  $("go").disabled = true;
  setStatus(s.working);
  const requestLang = lang;
  try {
    // text/plain keeps this a CORS simple request (no preflight).
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ urls: [$("url-a").value.trim(), $("url-b").value.trim()], lang, turnstile: turnstileToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setStatus(data.error || `Error ${res.status}`, true);
    setStatus("");
    lastResult = { ...data, lang: requestLang };
    render(data);
    $("result").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    setStatus(s.network, true);
  } finally {
    resetTurnstile();
  }
});

// ?a=…&b=… pre-fills the form, so a comparison link can be shared.
const params = new URLSearchParams(location.search);
if (params.get("a")) $("url-a").value = params.get("a");
if (params.get("b")) $("url-b").value = params.get("b");

applyLang();
loadTurnstile();

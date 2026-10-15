# RevCheck

The pre-purchase check from the RevSofia family. Paste two used-car listings from **mobile.bg** or **cars.bg** and get a side-by-side report and a verdict on which one is the better buy.

**Site:** https://georgievalex.github.io/revcheck/

## How the listings are read

mobile.bg and cars.bg refuse requests from DigitalOcean (a Cloudflare challenge or a 403). From Cloudflare's own network they answer. So the function reads pages through **revcheck-reader** (`cloudflare/reader/`), a small Cloudflare Worker:

- **Honest about who it is:** a `RevCheck/0.1 (+github link)` User-Agent, plus the `CF-Worker` header Cloudflare adds to every Worker request. Either site can block it with one rule, and if they do, we stop.
- **Not a public proxy:** it requires a shared secret that only the DigitalOcean function has, and it only fetches a mobile.bg listing, a cars.bg offer, or a filtered mobile.bg search page (`/obiavi/avtomobili-dzhipove/<make>/<model>[/<body>][/<fuel>]/ot-YYYY/do-YYYY[/p-1..3]`), or a cars.bg search page and its model list (`carslist.php?…`, `carmodel.php?brandId=N`).
- **Low volume:** about 10–20 page requests per comparison (2 listings, plus up to 3 mobile.bg and 1 cars.bg search page per car, twice if the search is widened), and only when a visitor clicks Compare.

## What it checks, per car

- **The listing:** price, year, mileage, power, fuel, gearbox, color, the seller's extras and description, and a VIN if one is in the text.
- **The photos:** **Gemma 4** (`gemma-4-31B-it`, open-weight, with vision) looks at up to 6 photos. It reports color, dents, scratches, rust and mismatched panels, and visible equipment such as M Sport bumpers, a panoramic roof, navigation or leather seats. It also flags extras the listing claims but the photos contradict.
- **The market:** the same make, model, body type and fuel, year ±1 (±2 when that finds fewer than 8), from **both** mobile.bg (up to 3 pages) and cars.bg (its own ids for brand, model, fuel, body and a ±10% power range). Cars listed on both sites count once. This gives "priced higher than N% of similar cars", plus the range and median. "See similar cars" links to the listing's own site first.
- **A fair price:** **TabPFN** (Prior Labs) is trained on those comparable cars, using year, km, power, engine size, fuel and gearbox. It returns a 10th–90th percentile price range for this exact car and how far the asking price is from it.
- **Known issues:** **DeepSeek V4 Pro** (open-weight, on DigitalOcean) names the likely engine code from year, power and displacement, and lists its documented weak spots with what to check at the viewing. When an engine changed mid-year (e.g. BMW's N52 to N53 around 2007), it gives both and says "likely", never "certain". It does **not** list recalls or service campaigns: in testing it confidently invented one, so the page tells buyers to have a dealer check open campaigns by VIN instead, with VIN-decoder links (mdecoder, bimmer.work) for the exact engine and build date.
- **Rule checks (no AI):** VIN present or missing, unusually low or high km per year, too few photos.

Gemma then reads both reports and writes the verdict: which car to pick and why, what to check in person, and what to ask the seller. The output is in English or Bulgarian.

## Architecture

```
browser ── GitHub Pages (static: docs/) + Cloudflare Turnstile widget
   │  POST text/plain {urls: [a, b], lang, turnstile}
   ▼
DigitalOcean Function  revcheck/compare   (holds the model, TabPFN, reader and Turnstile secrets)
   ├─ Turnstile check
   ├─ read 2 listings + up to 6 mobile.bg search pages ──► Cloudflare Worker revcheck-reader ──► mobile.bg / cars.bg
   ├─ parse (listing.js), then validate.js rebuilds each car from checked fields
   ├─ Gemma 4 vision on every photo, in batches of 8 ─┐  DigitalOcean Serverless Inference
   ├─ percentile / range / median on like-for-like cars│
   ├─ TabPFN fair-price range ────────────────────────┘  api.priorlabs.ai
   └─ Gemma 4 verdict
```

- **Parsed pages are untrusted.** The HTML is third-party, so `validate.js` keeps only known fields within sane ranges. Photo URLs must point at the two sites' image servers, because Gemma fetches them.
- **The odometer check is decided in code, not by the model.** In testing, Gemma once read a blurry "104677" as 266,777 and called it fraud. Now a reading only raises a flag if the model rates it clear *and* it's more than 15% off the listing, and the flag asks the buyer to check the dash in person. The prompts forbid fraud accusations.
- **Bot protection and spend:** same as RevSofia. A fresh single-use Turnstile token is verified before any model call. DigitalOcean inference is prepaid, with auto-reload off as the hard cap.
- **Degrades in parts:** without `TABPFN_KEY`, or with fewer than 15 comparables, the fair-price range is skipped. If the photo check or the verdict fails, the rest of the report still shows.

## Run it locally

```
cp .env.example .env    # fill in the keys
# with READER_URL/READER_SECRET set it reads through the Worker, like production;
# without them it reads from this machine
node --env-file=.env scripts/try-compare.mjs <listing A url> <listing B url> [en|bg]
npm test
```

## Deploy

```
doctl serverless deploy .
doctl serverless functions get revcheck/compare --url   # paste into docs/config.js
```

Reader Worker (from `cloudflare/reader/`):

```
npx wrangler deploy
npx wrangler secret put READER_SECRET   # same value as READER_SECRET in .env
```

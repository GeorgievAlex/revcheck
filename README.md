# KoyaKola

"Коя кола?" means "Which car?". Paste two used-car listings from **mobile.bg** or **cars.bg** and get a side-by-side report and a verdict on which one is the better buy.

**Site:** https://georgievalex.github.io/koyakola/ (once deployed)

## What it checks, per car

- **The listing:** price, year, mileage, power, fuel, gearbox, color, the seller's extras and description, and a VIN if one is in the text.
- **The photos:** **Gemma 4** (`gemma-4-31B-it`, open-weight, with vision) looks at up to 6 photos. It reports color, dents, scratches, rust and mismatched panels, and visible equipment such as M Sport bumpers, a panoramic roof, navigation or leather seats. It also flags extras the listing claims but the photos contradict.
- **The market:** the same make and model, year ±1 and same fuel, taken from up to 3 pages of mobile.bg search results (about 50 cars). This gives "priced higher than N% of similar listings", plus the range and median.
- **A fair price:** **TabPFN** (Prior Labs) is trained on those comparable cars, using year, km, power, engine size, fuel and gearbox. It returns a 10th–90th percentile price range for this exact car and how far the asking price is from it.
- **Rule checks (no AI):** VIN present or missing, unusually low or high km per year, too few photos.

Gemma then reads both reports and writes the verdict: which car to pick and why, what to check in person, and what to ask the seller. The output is in English or Bulgarian.

## Architecture

```
browser ── GitHub Pages (static: docs/) + Cloudflare Turnstile widget
   │  POST text/plain {urls: [a, b], lang, turnstile}
   ▼
DigitalOcean Function  koyakola/compare   (holds the model, TabPFN and Turnstile secrets)
   ├─ fetch both listings (mobile.bg / cars.bg only)
   ├─ Gemma 4 vision on each car's photos ─┐  DigitalOcean Serverless Inference
   ├─ mobile.bg comparables (3 pages)      │
   ├─ TabPFN fair-price range ─────────────┘  api.priorlabs.ai
   └─ Gemma 4 verdict
```

- **Only two hosts are fetched.** The visitor sends URLs, so `siteOf()` allowlists mobile.bg listing paths and cars.bg offer paths and rebuilds the URL itself. Nothing else is fetched, so the function can't be used as an open proxy.
- **Polite scraping:** both sites allow crawling in `robots.txt`. A comparison makes at most 8 page requests (2 listings + 3 search pages each), and only when a visitor asks for one, with an honest `User-Agent`. auto.bg is left out because it sits behind a Cloudflare bot challenge.
- **Comparables come from mobile.bg for both sites.** Its search URLs are clean (`/make/model/ot-YEAR/do-YEAR/p-N`) and the result cards carry every feature TabPFN needs. cars.bg search needs internal brand and model IDs that its listing pages don't expose.
- **Bot protection and spend:** same as RevSofia. A fresh single-use Turnstile token is verified before any fetch or model call. DigitalOcean inference is prepaid, with auto-reload off as the hard cap.
- **Degrades in parts:** without `TABPFN_KEY`, or with fewer than 15 comparables, the fair-price range is skipped. If the photo check or the verdict fails, the rest of the report still shows.

## Run it locally

```
cp .env.example .env    # fill in the keys
node --env-file=.env scripts/try-compare.mjs <listing A url> <listing B url> [en|bg]
npm test
```

## Deploy

```
doctl serverless deploy .
doctl serverless functions get koyakola/compare --url   # paste into docs/config.js
```

Then enable GitHub Pages from `docs/` on `main`.

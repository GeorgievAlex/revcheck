# RevCheck

The pre-purchase check from the RevSofia family. Paste two used-car listings from **mobile.bg** or **cars.bg** and get a side-by-side report and a verdict on which one is the better buy.

**Site:** https://georgievalex.github.io/revcheck/

## Why there's an extension

mobile.bg and cars.bg serve a Cloudflare challenge or a 403 to requests from cloud servers. Fetches from a home connection work fine. RevCheck respects that block instead of working around it, so **the listings are read from your own browser** by a small read-only extension, **RevCheck Reader** (`extension/`, about 60 lines):

- It only fetches three kinds of URL, each checked against an allowlist: a mobile.bg listing, a cars.bg offer, and a mobile.bg search page (`/obiavi/avtomobili-dzhipove/<make>/<model>/ot-YYYY/do-YYYY[/p-1..3]`).
- It only acts when the RevCheck page asks (through a content script on `georgievalex.github.io/revcheck/`), and it sends no cookies.
- Install: download `revcheck-reader.zip` from the site, open `chrome://extensions`, turn on Developer mode, then click "Load unpacked".

## What it checks, per car

- **The listing:** price, year, mileage, power, fuel, gearbox, color, the seller's extras and description, and a VIN if one is in the text.
- **The photos:** **Gemma 4** (`gemma-4-31B-it`, open-weight, with vision) looks at up to 6 photos. It reports color, dents, scratches, rust and mismatched panels, and visible equipment such as M Sport bumpers, a panoramic roof, navigation or leather seats. It also flags extras the listing claims but the photos contradict.
- **The market:** the same make and model, year ±1 and same fuel, taken from up to 3 pages of mobile.bg search results (about 50 cars). This gives "priced higher than N% of similar listings", plus the range and median. cars.bg listings are matched against mobile.bg too, because cars.bg search needs internal IDs its listing pages don't show.
- **A fair price:** **TabPFN** (Prior Labs) is trained on those comparable cars, using year, km, power, engine size, fuel and gearbox. It returns a 10th–90th percentile price range for this exact car and how far the asking price is from it.
- **Rule checks (no AI):** VIN present or missing, unusually low or high km per year, too few photos.

Gemma then reads both reports and writes the verdict: which car to pick and why, what to check in person, and what to ask the seller. The output is in English or Bulgarian.

## Architecture

```
browser ── GitHub Pages (static: docs/) + Cloudflare Turnstile widget
   │  RevCheck Reader extension fetches the 2 listings + up to 6 mobile.bg search pages
   │  docs/lib/listing.js parses them
   │  POST text/plain {cars: [{listing, comparables, search_url} ×2], lang, turnstile}
   ▼
DigitalOcean Function  revcheck/compare   (holds the model, TabPFN and Turnstile secrets)
   ├─ Turnstile check, then validate.js rebuilds each car from checked fields
   ├─ Gemma 4 vision on each car's photos ─┐  DigitalOcean Serverless Inference
   ├─ percentile / range / median          │
   ├─ TabPFN fair-price range ─────────────┘  api.priorlabs.ai
   └─ Gemma 4 verdict
```

- **Browser data is untrusted.** `validate.js` keeps only known fields within sane ranges, at most 200 comparables per car. Photo URLs must point at the two sites' image servers, because Gemma fetches them.
- **Bot protection and spend:** same as RevSofia. A fresh single-use Turnstile token is verified before any model call. DigitalOcean inference is prepaid, with auto-reload off as the hard cap.
- **Degrades in parts:** without `TABPFN_KEY`, or with fewer than 15 comparables, the fair-price range is skipped. If the photo check or the verdict fails, the rest of the report still shows.

## Run it locally

```
cp .env.example .env    # fill in the keys
# reads the listings from this machine, like the extension does in the browser
node --env-file=.env scripts/try-compare.mjs <listing A url> <listing B url> [en|bg]
npm test
```

## Deploy

```
doctl serverless deploy .
doctl serverless functions get revcheck/compare --url   # paste into docs/config.js
```

After changing `extension/`, run `npm run pack` to rebuild `docs/revcheck-reader.zip`.

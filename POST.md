---
title: "RevCheck: paste two used-car listings, get a second opinion before you drive across town"
cover_image: https://georgievalex.github.io/revcheck/media/cover.jpg
published: false
tags: devchallenge, hf26challenge, ai, opensource
ai_disclosure_level: ai_assisted
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 2: Side Hustle](https://dev.to/challenges/hacktoberfest-week2-2026-10-12)*

## What I Built

Buying a used car in Bulgaria goes like this. You have twelve tabs open on mobile.bg and cars.bg. Half of them say "нов внос" (fresh import), "реални километри" (real mileage) and "без забележки" (nothing to fix). The same car shows up on both sites. Then you lose a Saturday driving to Plovdiv for a car that turned out to have a different engine, a seat that's been through a dog, and a price nobody else is asking.

So I built **[RevCheck](https://georgievalex.github.io/revcheck/)**. You paste two listings, from either site, and about 30 seconds later you get a side-by-side report and a verdict:

- **Every photo is checked** by Gemma 4: color, dents, scratches, mismatched panels, and the equipment you can actually see (M Sport bumpers, panoramic roof, leather, navigation). It also flags extras the seller lists but the photos contradict.
- **The market position.** It finds similar cars for sale on *both* sites (same model, body type, fuel and engine power, year ±1) and tells you "priced higher than 91% of 44 similar listings". A car listed on both sites only counts once.
- **A fair price range from TabPFN**, trained on those comparables during the request: "€4,718 – €8,665, so this one is €2,276 above the expected price".
- **The known weak spots of that exact engine.** DeepSeek V4 names the likely engine code from year, power and displacement (N47D20C, N52 or N53, and so on) and lists what to check at the viewing: timing chain rattle on a cold start, swirl flaps, the ZF gearbox, the high-pressure fuel pump.
- **Plain checks with no AI:** a missing VIN, unusually low or high km per year, too few photos, a US or Canada import (go and run that VIN).
- **The verdict:** which car to go and see, why, what to check on each one, and what to ask the seller before you get in the car.
- **English and Bulgarian**, with the flags at the top. The report is written in whichever language you pick.

**Who would pay for this?** Anyone about to spend half a day and a tank of fuel on a viewing. People already pay mechanics and inspectors to look at a car in person before they buy. RevCheck is the step before that: it tells you which of the two is worth the trip. I'd keep a couple of comparisons a day free and charge flippers and small dealers, who compare dozens of cars a week, a small monthly fee.

## Demo

**Live site:** https://georgievalex.github.io/revcheck/

Try it with two BMW 320d estates that are for sale right now:
https://georgievalex.github.io/revcheck/?a=https://www.mobile.bg/obiava-11744111052659454-bmw-320-2-0d&b=https://www.mobile.bg/obiava-11787314145036432

Paste two links, tick the box, click Compare:

![The RevCheck form with two mobile.bg links](https://georgievalex.github.io/revcheck/media/form.jpg)

The verdict comes back first. Each car card fills in as soon as that car is done:

![The verdict: listing B is the better deal, with the reasons and questions for the seller](https://georgievalex.github.io/revcheck/media/verdict.jpg)

The market position, the TabPFN fair price range and what the photos show:

![Market position, TabPFN fair range and the photo check for both cars](https://georgievalex.github.io/revcheck/media/market.jpg)

And the known weak spots for the engine, with what to check at the viewing:

![Known issues for the N47 diesel: timing chain, EGR, swirl flaps, dual-mass flywheel](https://georgievalex.github.io/revcheck/media/known-issues.jpg)

## Code

{% embed https://github.com/GeorgievAlex/revcheck %}

## How I Built It

Same rule as my last two entries: no framework, no database, no npm dependencies. A static page on GitHub Pages, one DigitalOcean Function and one tiny Cloudflare Worker.

```plaintext
browser ── GitHub Pages (static) + Cloudflare Turnstile
   │  start   → bot check, returns a 3-minute signed ticket for these two links
   │  car ×2  → one request per car, in parallel
   │  verdict → the written comparison
   ▼
DigitalOcean Function  revcheck/compare
   ├─ reads listings + search pages ──► Cloudflare Worker ──► mobile.bg / cars.bg
   ├─ Gemma 4 (vision): every photo, 8 per call      ┐
   ├─ DeepSeek V4 Pro: engine + known weak spots      ├ DigitalOcean Serverless Inference
   ├─ Gemma 4: the verdict                            ┘
   └─ TabPFN 3.5: fair price from the comparables ──► Prior Labs API
```

| Job | Model | Why this one |
|---|---|---|
| Look at the photos | `gemma-4-31B-it` (open-weight) | Reads a dashboard, a bumper and a seat in one pass, in Bulgarian or English |
| Engine and weak spots | `deepseek-v4-pro` (open-weight) | I tried four open models on the same car. Two returned broken JSON, and of the other two only DeepSeek brought up the gearbox |
| Fair price | TabPFN 3.5 | Trains on the ~50 comparables inside the request, no training pipeline of my own |
| The verdict | `gemma-4-31B-it` | Weighs all of the above and writes like a friend who knows cars |

A few things I'm happy with:

- **The browser data is untrusted.** The verdict step gets each car's results back from the page, so every field is rebuilt from a known list with size caps before it reaches the model. Photo URLs have to point at the two sites' image servers, because Gemma downloads them.
- **The scary stuff is decided in code, not by the model.** The odometer flag, the VIN check, km per year and US imports are all rules. The model can only *suggest* something to check (more on why below).
- **Every slow step has a deadline.** If the known-issues lookup hangs, you get the car without it instead of no car at all.
- **26 tests**, all `node:test`, including the ugly real-world cases from the next section.

The [commit history](https://github.com/GeorgievAlex/revcheck/commits/main) has one commit per lesson below, if you want to see them land.

## What I got wrong on the way

**The listing sites block DigitalOcean.** My first version fetched listings from the function, and on my laptop it worked perfectly. Once deployed, mobile.bg answered with a Cloudflare "Just a moment..." page and cars.bg with a 403. They block cloud servers, which is fair, they're tired of scrapers. The browser can't read them either, because neither site allows other websites to (no CORS headers). I built a small browser extension, and then threw it away, because nobody is going to install an extension from a site they've never heard of. What worked was a Cloudflare Worker that does nothing but fetch a listing, a search page or a model list. It sends `RevCheck/0.1` and a link to the repo as its User-Agent, and Cloudflare adds a header naming the Worker, so either site can see exactly who's asking and block it with one rule. If they do, that's their call and I'll stop. It needs a secret only my function has, and it refuses any other URL, so it isn't an open proxy.

**Gemma accused a seller of odometer fraud.** On a 2012 Audi Q5 listed at 104,000 km, it read the dashboard photo as 266,777 km and the verdict called it "severe odometer fraud". I zoomed into the photo myself: the dash says 104,677. A blurry digit nearly got a real person called a fraudster on a public page. Now the model only *reads* the odometer and rates the reading clear or unclear, and the code decides. A flag only appears if the reading is clear and more than 15% off, and even then it says "check the dash in person". The prompts now ban accusations outright.

**"Not enough photos" on a listing with 10 photos.** DigitalOcean's endpoint takes at most 8 image links per call, so I check photos in parallel batches of 8. The last batch had just 2 interior photos, and the model, seeing only those, wrote "very few photos, interior only". The model doesn't get to judge photo count any more. The code does.

**A coupe compared against sedans.** One cars.bg seller typed the body type as "Kупе", with a Latin K. My body-type filter didn't recognise it and quietly searched without it. Funny enough, cars.bg's own search form spells it with a Latin K too. Body types are now compared after mapping Latin look-alike letters to Cyrillic, and there's a test with that exact string.

**The AI invented a recall.** I wanted RevCheck to list manufacturer campaigns, the "VANOS bolts" kind. DeepSeek confidently listed a VANOS bolt campaign for an N52 engine, which as far as I know was for different engines. I'd also gotten something wrong myself while testing: I told it a 2007 272 hp 330i *had* to be an N53, when the N52 made the same power until the changeover that year. So two changes. Recalls aren't generated at all: the page tells you to have a dealer check open campaigns by VIN, and links to a VIN decoder. And when an engine changed mid-year, the model has to give both and say "likely", never "certain".

**Requests died at exactly 40 seconds.** With photos, TabPFN and the known-issues lookup, a full comparison took 33–45 seconds, and every so often the page said "couldn't reach the comparer". I deployed a test function that just sleeps: DigitalOcean's web gateway answers `202 Response not yet ready` after exactly 40 seconds, whatever the function's own timeout is. So a comparison is now three kinds of short requests (start in ~2 s, each car in ~19 s in parallel, the verdict in ~8 s), tied together by a signed ticket so the bot check still covers all of them. As a bonus, the cars now show up before the verdict.

## Why Does Open Innovation Matter?

- **The right model for each job, behind one endpoint.** Gemma looks at photos, DeepSeek knows engines, TabPFN does the numbers. With open-weight models on DigitalOcean's serverless inference, switching the known-issues step from Gemma to DeepSeek after testing was one string. With a single closed API, I'd have been stuck with whatever that vendor's one model knows about BMW timing chains.
- **It has to be cheap per comparison, or the side hustle doesn't work.** One comparison is 6 to 8 model calls. Open models on prepaid inference keep that cheap enough to give a couple away free every day, and the prepaid balance with auto-reload off is a hard cap on the bill.
- **TabPFN trains on today's market, inside the request.** No dataset to collect, no model to retrain. The 50 cars for sale *right now* are the training set, which is exactly what you want for used-car prices.
- **Open code is how you earn trust when you read other people's sites.** The Worker that fetches listings is about 50 lines in the repo. Anyone, including mobile.bg and cars.bg, can read exactly what it fetches and how often.

## Prize Categories

- **Best Use of DigitalOcean:** a DigitalOcean Function runs the whole backend, and DigitalOcean Serverless Inference serves both open-weight models (Gemma 4 and DeepSeek V4 Pro). The 40-second gateway lesson above is a DigitalOcean story too.
- **Best Use of Gemma:** `gemma-4-31B-it` checks every photo, with damage, equipment and odometer readings, and writes the final verdict in English or Bulgarian.
- **Best Use of TabPFN:** TabPFN 3.5 predicts a fair price range (10th to 90th percentile) for each car, trained on live comparables from two sites, and that prediction feeds the verdict. It's one step inside the larger prediction pipeline, not a standalone demo.

## What's next

- **Exact engine codes and campaigns from the VIN.** The BMW decoders I use myself don't allow automated lookups, so for now RevCheck just links to them. OEMNavigations sells an official BMW VIN API, which would give the exact engine, build date and campaigns instead of "likely".
- **Asking mobile.bg and cars.bg for proper access**, now that there's something real to show them.
- **mobile.de**, through its official API, for the "what would this car cost in Germany plus import" question that every Bulgarian buyer asks.

**Buying a used car in Bulgaria?** Paste your two favourites into [RevCheck](https://georgievalex.github.io/revcheck/) before you drive anywhere.

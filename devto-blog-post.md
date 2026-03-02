---
title: I Built AniRec — An AI Anime Recommendation Engine (AniList + Gemini + Vercel)
published: true
tags: weekendchallenge, javascript, ai, anime
cover_image: https://dev-to-uploads.s3.amazonaws.com/uploads/articles/placeholder.png
---

*This post is part of the [#WeekendChallenge](https://dev.to/t/weekendchallenge) — Build for Your Community.*

---

## The Community

I've been part of the anime community for years. Discord servers at 2am debating peak fiction, MyAnimeList profiles that expose your entire personality, that friend who insists Vinland Saga S2 is better than S1 (they're not wrong).

The problem I kept running into: **"I just finished [insert banger here]. What do I watch next?"**

MAL's recommendation tab is hit or miss. Every "best anime of all time" list is the same 10 shows. And nothing actually *reads your taste* to surface something genuinely fitted to you.

This weekend I built **AniRec** — you type the anime you've watched, and Gemini + AniList figure out exactly what you'd love next.

---

## What is AniRec?

A dead-simple flow:

1. **Type your watched anime** → autocomplete pulls from AniList in real time
2. **Hit Get Recommendations** → the backend builds your taste profile, fetches candidates from AniList, asks Gemini 2.0 Flash to pick the best 6
3. **Get cards with AI-written reasons** — not generic "fans also liked" but actual reasoning like *"If you loved the political intrigue in Code Geass, you'll find similar manipulation and power plays in Legend of the Galactic Heroes"*

No login. No account. No friction.

---

## The Stack

### Frontend: Plain HTML + Vanilla JS

No framework. No bundler. No build step. Deployed directly on Vercel as a static file.

- Pure CSS animations (the loading spinner, card stagger, chip entry)
- AniList autocomplete on every keypress (debounced 300ms)
- Tag-chip input system for building your watched list
- Everything in one `index.html`

The aesthetic: dark purple-on-black editorial with glowing orbs, grid background, and `Bebas Neue` for display + `Space Grotesk` for body. Keeps the anime-forum energy without being garish.

### API: AniList GraphQL

[AniList](https://anilist.gitbook.io/anilist-apiv2-docs/) is the API you should be using for anime projects. It's:
- **Free**, no API key required for public queries
- **GraphQL** — fetch exactly the fields you need
- **500k+ entries** with genres, tags, studios, scores, seasons, trailers
- **No rate limit anxiety** (public queries are generous)

A sample query to search anime and get rich metadata:

```javascript
const query = `
  query ($search: String) {
    Media(search: $search, type: ANIME) {
      id
      title { romaji english }
      genres
      tags { name rank }
      averageScore
      coverImage { large }
      studios(isMain: true) { nodes { name } }
    }
  }
`;

const res = await fetch('https://graphql.anilist.co', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, variables: { search: 'Demon Slayer' } })
});
```

Clean, typed, no auth header required. This is now my go-to for any anime project.

### Backend: Vercel Edge Function + Gemini 2.0 Flash

The backend does three things:

**1. Fetch metadata for each watched title**
```javascript
const watchedData = await Promise.all(
  watchedList.map(title => searchAnime(title))
);
```

**2. Build a taste profile**
```javascript
const allGenres = validWatched.flatMap(a => a.genres || []);
const genreFreq = {};
allGenres.forEach(g => { genreFreq[g] = (genreFreq[g] || 0) + 1; });
const topGenres = Object.entries(genreFreq)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 4)
  .map(([g]) => g);
```

**3. Ask Gemini to rank candidates**

This is where it gets interesting. I don't just throw the user's list at Gemini and say "recommend something". I:
- Fetch 20 real candidate anime from AniList that match the top genres
- Give Gemini the user's watched list, their computed taste profile, AND the candidate list
- Ask it to pick 6 and explain *why* in one punchy sentence per show

```javascript
const prompt = `You are an expert anime recommendation engine.

The user has watched these anime:
${watchedSummary}

Their taste profile: top genres [${topGenres}], key themes [${topTags}].

From this candidate list, pick exactly 6 anime they would love most.
For each, give a punchy 1-sentence reason referencing something specific from what they watched.

Candidates:
${candidateSummary}

Respond ONLY with valid JSON array:
[{ "id": <anilist_id>, "reason": "<1 sentence>" }, ...]`;
```

The model gets *grounded* in real data from AniList instead of hallucinating titles. Gemini picks from actual anime that exist and are good.

**4. Hydrate the picks with full AniList data** (covers, scores, studio, siteUrl) and return to the frontend.

The Gemini API key stays in `process.env.GEMINI_API_KEY` — set it in Vercel's environment variables dashboard. Never touches the browser.

---

## Architecture Diagram

```
Browser
  │
  ├── Autocomplete → AniList GraphQL (direct, no key needed)
  │
  └── POST /api/recommend
        │
        ├── AniList: fetch metadata for watched list
        ├── AniList: fetch candidate anime by genre
        ├── Gemini 2.0 Flash: rank + reason
        └── AniList: hydrate recommendation cards
             │
             └── JSON response → render cards in browser
```

---

## Deploying to Vercel

Project structure:
```
animerec/
├── api/
│   └── recommend.js   ← Edge function (Gemini key lives here)
├── public/
│   └── index.html     ← The entire frontend
└── vercel.json        ← Route config
```

`vercel.json`:
```json
{
  "version": 2,
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/$1" },
    { "src": "/(.*)", "dest": "/public/$1" }
  ]
}
```

Deploy:
```bash
npm i -g vercel
vercel --prod
# Set GEMINI_API_KEY in Vercel dashboard → Settings → Environment Variables
```

That's it. No build step. No `npm install`. Static HTML + one edge function. Cold starts are under 100ms.

---

## What I Learned

**1. AniList > Jikan for any serious project.**
GraphQL means one endpoint, typed responses, no over-fetching. The `tags` field (with `rank` weights) is a goldmine for building taste profiles — tags like "Psychological", "Found Family", "Time Skip" tell you far more than genres alone.

**2. Grounding LLMs in real data = dramatically better recommendations.**
My first attempt just gave Gemini the watched list and asked it to recommend. It hallucinated titles or gave generic answers. Feeding it a pre-filtered candidate list from AniList transformed output quality — it was now ranking real, great anime instead of inventing things.

**3. Edge functions are perfect for API key proxies.**
The entire pattern of "frontend calls my API, my API calls the LLM" takes 30 lines on Vercel Edge. No server, no cost, no infra.

**4. Vanilla HTML can be beautiful.**
No React, no Tailwind compiler, no Webpack. Pure CSS variables, `@keyframes`, Google Fonts, and thoughtful layout. Ships as a single file. Loads in ~300ms. The anime community doesn't need a SPA — it needs a fast, usable, beautiful page.

---

## What's Next

- **Vibes mode** — pick a mood (dark & psychological, wholesome, action-packed) instead of titles
- **Export your taste card** — shareable image of your profile + picks, like Spotify Wrapped for anime
- **MAL import** — paste your MAL username, auto-populate your watched list
- **Seasonal picks** — "based on your taste, here's what to watch this season"

---

## Try It

**Live:** [anirec.vercel.app](https://anirec.vercel.app) *(deploy your own using the source below)*

**Source:** Single `index.html` + one 150-line edge function. Zero npm dependencies.

APIs used:
- [AniList GraphQL](https://anilist.gitbook.io/anilist-apiv2-docs/) — free, no key, 500k entries
- [Google Gemini 2.0 Flash](https://ai.google.dev/) — free tier is generous

If you're part of the anime community, try it with your actual list — I'm curious if the AI reasoning actually resonates or reads as generic.

Drop your watch count in the comments 👇

---

*Tags: #weekendchallenge #javascript #ai #anime*

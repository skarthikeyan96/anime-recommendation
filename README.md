# AniRec — AI Anime Recommendations

An AI-powered anime recommendation engine that analyzes your watching history and suggests what to binge next. Built with the AniList GraphQL API and Google Gemini 2.5 Flash, deployed as a Vercel Edge Function.

## How It Works

1. **You add anime** you've watched (with autocomplete from AniList)
2. **AniList API** fetches metadata — genres, tags, scores, studios
3. A **taste profile** is built from your top genres and recurring themes
4. **Candidate anime** matching your taste are pulled from AniList
5. **Gemini 2.5 Flash** ranks the best picks and writes a personalized reason for each
6. Results are displayed as rich cards with scores, episode counts, and direct AniList links

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Vanilla HTML/CSS/JS with Space Grotesk + Bebas Neue typography |
| Backend | Vercel Edge Function (serverless, ~0ms cold start) |
| Anime Data | [AniList GraphQL API](https://anilist.gitbook.io/anilist-apiv2-docs/) |
| AI | [Google Gemini 2.5 Flash](https://ai.google.dev/) |
| Hosting | [Vercel](https://vercel.com) |

## Project Structure

```
├── api/
│   └── recommend.js    # Edge function — taste analysis + Gemini ranking
├── public/
│   └── index.html      # Frontend — tag input, autocomplete, result cards
├── vercel.json         # Routing config
└── README.md
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Vercel CLI](https://vercel.com/docs/cli) (`npm i -g vercel`)
- A free [Gemini API key](https://aistudio.google.com/app/apikey) (1,500 req/day on free tier)

### Deploy

```bash
vercel
```

Answer the prompts, then add your API key:

```bash
vercel env add GEMINI_API_KEY
# paste your key, select all environments
```

Deploy to production:

```bash
vercel --prod
```

### Local Development

```bash
vercel dev
```

This runs the edge function locally at `http://localhost:3000` with your env variables.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key ([get one free](https://aistudio.google.com/app/apikey)) |

## License

MIT

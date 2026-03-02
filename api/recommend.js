export const config = { runtime: "edge" };

const ANILIST = "https://graphql.anilist.co";

// Search AniList for an anime title, return metadata
async function searchAnime(title) {
  const query = `
    query ($search: String) {
      Media(search: $search, type: ANIME) {
        id
        title { romaji english }
        genres
        tags { name rank }
        averageScore
        popularity
        description(asHtml: false)
        coverImage { large }
        season
        seasonYear
        episodes
        status
        studios(isMain: true) { nodes { name } }
      }
    }
  `;
  const res = await fetch(ANILIST, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { search: title } }),
  });
  const json = await res.json();
  return json.data?.Media || null;
}

// Fetch anime details by ID for recommendation cards
async function fetchAnimeById(id) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        title { romaji english }
        genres
        averageScore
        popularity
        description(asHtml: false)
        coverImage { large }
        season
        seasonYear
        episodes
        status
        siteUrl
        studios(isMain: true) { nodes { name } }
      }
    }
  `;
  const res = await fetch(ANILIST, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { id } }),
  });
  const json = await res.json();
  return json.data?.Media || null;
}

// Search by genre + score for recommendation candidates
async function searchByGenres(genres, excludeIds, page = 1) {
  const query = `
    query ($genres: [String], $notIn: [Int], $page: Int) {
      Page(page: $page, perPage: 20) {
        media(type: ANIME, genre_in: $genres, id_not_in: $notIn, sort: SCORE_DESC, status: FINISHED) {
          id
          title { romaji english }
          genres
          averageScore
          popularity
          coverImage { large }
          season
          seasonYear
          episodes
          siteUrl
          studios(isMain: true) { nodes { name } }
          description(asHtml: false)
        }
      }
    }
  `;
  const res = await fetch(ANILIST, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query,
      variables: { genres, notIn: excludeIds, page },
    }),
  });
  const json = await res.json();
  return json.data?.Page?.media || [];
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
    });
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    return new Response(
      JSON.stringify({ error: "Gemini API key not configured" }),
      { status: 500 },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
    });
  }

  const { watchedList } = body; // array of strings like ["Attack on Titan", "Fullmetal Alchemist"]
  if (!watchedList || !Array.isArray(watchedList) || watchedList.length === 0) {
    return new Response(JSON.stringify({ error: "watchedList is required" }), {
      status: 400,
    });
  }

  try {
    // 1. Fetch metadata for each watched anime from AniList
    const watchedData = await Promise.all(
      watchedList.slice(0, 10).map((title) => searchAnime(title)),
    );
    const validWatched = watchedData.filter(Boolean);

    if (validWatched.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Could not find any of those anime on AniList",
        }),
        { status: 400 },
      );
    }

    // 2. Extract taste profile
    const allGenres = validWatched.flatMap((a) => a.genres || []);
    const genreFreq = {};
    allGenres.forEach((g) => {
      genreFreq[g] = (genreFreq[g] || 0) + 1;
    });
    const topGenres = Object.entries(genreFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([g]) => g);

    const allTags = validWatched.flatMap((a) =>
      (a.tags || []).filter((t) => t.rank > 60).map((t) => t.name),
    );
    const tagFreq = {};
    allTags.forEach((t) => {
      tagFreq[t] = (tagFreq[t] || 0) + 1;
    });
    const topTags = Object.entries(tagFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([t]) => t);

    const watchedIds = validWatched.map((a) => a.id);

    // 3. Fetch candidates from AniList matching taste
    const candidates = await searchByGenres(topGenres, watchedIds);

    // 4. Ask Gemini to pick best 6 with reasoning
    const watchedSummary = validWatched
      .map(
        (a) =>
          `- ${a.title.english || a.title.romaji} (genres: ${a.genres?.join(", ")}, score: ${a.averageScore})`,
      )
      .join("\n");

    const candidateSummary = candidates
      .slice(0, 20)
      .map(
        (a) =>
          `ID:${a.id} "${a.title.english || a.title.romaji}" genres:[${a.genres?.join(",")}] score:${a.averageScore}`,
      )
      .join("\n");

    const prompt = `You are an expert anime recommendation engine.

The user has watched these anime:
${watchedSummary}

Their taste profile: top genres are [${topGenres.join(", ")}], key themes include [${topTags.join(", ")}].

From this candidate list, pick exactly 6 anime they would love most. For each, give a punchy 1-sentence reason that references something specific from what they watched.

Candidates:
${candidateSummary}

Respond ONLY with valid JSON array, no markdown, no preamble:
[
  { "id": <anilist_id>, "reason": "<1 sentence why they'll love it>" },
  ...
]`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 2048 } },
        }),
      },
    );

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      return new Response(
        JSON.stringify({ error: "Gemini API error", detail: geminiData }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    const responsePart = parts.filter((p) => !p.thought).pop();
    const rawText = responsePart?.text || "[]";
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    const clean = jsonMatch ? jsonMatch[0] : "[]";
    let picks;
    try {
      picks = JSON.parse(clean);
    } catch {
      picks = [];
    }

    // 5. Hydrate picks with full AniList data
    const recommendations = await Promise.all(
      picks.slice(0, 6).map(async (pick) => {
        const anime =
          candidates.find((c) => c.id === pick.id) ||
          (await fetchAnimeById(pick.id));
        if (!anime) return null;
        return {
          id: anime.id,
          title: anime.title.english || anime.title.romaji,
          titleJp: anime.title.romaji,
          cover: anime.coverImage?.large,
          genres: anime.genres?.slice(0, 3),
          score: anime.averageScore,
          episodes: anime.episodes,
          season: anime.season,
          year: anime.seasonYear,
          studio: anime.studios?.nodes?.[0]?.name,
          description: anime.description?.slice(0, 200),
          siteUrl: anime.siteUrl,
          reason: pick.reason,
        };
      }),
    );

    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const watchedNorms = new Set([
      ...watchedList.map(normalize),
      ...validWatched.flatMap((a) =>
        [a.title.english, a.title.romaji].filter(Boolean).map(normalize)
      ),
    ]);
    const deduped = recommendations.filter(Boolean).filter((r) =>
      !watchedNorms.has(normalize(r.title)) && !watchedNorms.has(normalize(r.titleJp))
    );

    const profile = {
      topGenres,
      topTags: topTags.slice(0, 4),
      watchedCount: validWatched.length,
      avgScore: Math.round(
        validWatched.reduce((s, a) => s + (a.averageScore || 0), 0) /
          validWatched.length,
      ),
    };

    return new Response(
      JSON.stringify({
        recommendations: deduped,
        profile,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
}

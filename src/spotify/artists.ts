import type { Seed } from "@/core/seeds";
import { spotifyGet, type SpotifyContext } from "@/spotify/client";

type SpotifyArtist = {
  id: string;
  name: string;
  images: { url: string }[];
};
type Paging<T> = { items: T[] };

export async function topArtists(ctx: SpotifyContext): Promise<Seed[]> {
  const { items } = await spotifyGet<Paging<SpotifyArtist>>(
    ctx,
    "/me/top/artists",
    { time_range: "short_term" },
  );
  return items.map(toSeed);
}

export async function searchArtists(
  ctx: SpotifyContext,
  query: string,
): Promise<Seed[]> {
  // Development Mode caps search results at 10
  const { artists } = await spotifyGet<{ artists: Paging<SpotifyArtist> }>(
    ctx,
    "/search",
    { q: query, type: "artist", limit: "10" },
  );
  return artists.items.map(toSeed);
}

// Spotify lists images widest first, and Seed cards only need a small one
function toSeed({ id, name, images }: SpotifyArtist): Seed {
  return { spotifyId: id, name, imageUrl: images.at(-1)?.url ?? null };
}

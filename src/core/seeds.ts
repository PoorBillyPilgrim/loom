import type { LoomContext } from "@/core/context";
import { searchArtists, topArtists } from "@/spotify/artists";

export type Seed = {
  spotifyId: string;
  name: string;
  imageUrl: string | null;
};

/** The Listener's recent top artists, or a search when they typed one */
export function seedCandidates(ctx: LoomContext, query = ""): Promise<Seed[]> {
  const search = query.trim();
  return search ? searchArtists(ctx, search) : topArtists(ctx);
}

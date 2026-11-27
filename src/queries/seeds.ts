import { queryOptions } from "@tanstack/react-query";
import type { Result } from "@/core/errors";
import type { Seed } from "@/core/seeds";
import { getSeedCandidates } from "@/server/seeds";

// Top artists barely change in five minutes, and every fetch spends Spotify's shared quota
const SEEDS_FRESH_MS = 5 * 60 * 1000;

export function seedsStaleTime(result: Result<Seed[]> | undefined): number {
  return result?.ok ? SEEDS_FRESH_MS : 0;
}

export function seedCandidatesQuery(q?: string) {
  const search = q?.trim() ?? "";
  return queryOptions({
    queryKey: ["seed-candidates", search],
    queryFn: () => getSeedCandidates({ data: { q: search } }),
    staleTime: query => seedsStaleTime(query.state.data),
    // Only the Explore loader decides when to call Spotify
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

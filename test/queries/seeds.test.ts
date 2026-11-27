import {
  QueryClient,
  QueryObserver,
  focusManager,
} from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import type { LoomErrorCode, Result } from "@/core/errors";
import type { Seed } from "@/core/seeds";
import { seedCandidatesQuery, seedsStaleTime } from "@/queries/seeds";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

let clients: QueryClient[] = [];

// workerd counts as a server, where Query skips retries, so spell out the browser's defaults.
// Mounting is what QueryClientProvider does, and it's what listens for the tab regaining focus.
function browserQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 3,
        retryDelay: 0,
        refetchOnMount: true,
        refetchOnWindowFocus: true,
      },
    },
  });
  client.mount();
  clients.push(client);
  return client;
}

/** The Seeds query with each call to Spotify counted instead of made */
function countedSeedsQuery(answer: () => Promise<Result<Seed[]>>) {
  const counter = { calls: 0 };
  const options = {
    ...seedCandidatesQuery("big thief"),
    queryFn: () => {
      counter.calls += 1;
      return answer();
    },
  };
  return { counter, options };
}

const quotaExceeded = (): Promise<Result<Seed[]>> =>
  Promise.resolve({ ok: false, error: "spotify_quota_exceeded" });

const settle = () => new Promise(resolve => setTimeout(resolve, 10));

afterEach(() => {
  for (const client of clients) client.unmount();
  clients = [];
  focusManager.setFocused(undefined);
});

describe("Seed candidates query", () => {
  it("keeps Seeds fresh for five minutes, so going back doesn't spend Spotify's quota", () => {
    expect(seedsStaleTime({ ok: true, value: [] })).toBe(FIVE_MINUTES_MS);
  });

  it.each<LoomErrorCode>([
    "not_signed_in",
    "spotify_not_connected",
    "spotify_needs_reconnect",
    "spotify_quota_exceeded",
    "spotify_rate_limited",
    "spotify_unavailable",
  ])("never keeps a %s result around", error => {
    expect(seedsStaleTime({ ok: false, error })).toBe(0);
  });

  it("refetches when nothing has loaded yet", () => {
    expect(seedsStaleTime(undefined)).toBe(0);
  });

  it("shares one cache entry for no search and a blank search", () => {
    const key = seedCandidatesQuery().queryKey;

    expect(seedCandidatesQuery("").queryKey).toEqual(key);
    expect(seedCandidatesQuery("   ").queryKey).toEqual(key);
  });

  it("caches each search separately, ignoring surrounding spaces", () => {
    const topArtists = seedCandidatesQuery().queryKey;
    const bigThief = seedCandidatesQuery("big thief").queryKey;

    expect(bigThief).not.toEqual(topArtists);
    expect(seedCandidatesQuery("  big thief ").queryKey).toEqual(bigThief);
    expect(seedCandidatesQuery("wednesday").queryKey).not.toEqual(bigThief);
  });
});

// Every refetch spends Spotify's shared quota, so only the Explore loader decides when to call Spotify
describe("Seed candidates query refetching", () => {
  it("doesn't fetch again when Explore mounts after its loader fetched", async () => {
    const client = browserQueryClient();
    const { counter, options } = countedSeedsQuery(quotaExceeded);
    await client.fetchQuery(options);

    const unsubscribe = new QueryObserver(client, options).subscribe(() => {});
    await settle();
    unsubscribe();

    expect(counter.calls).toBe(1);
  });

  it("doesn't fetch again when the Listener comes back to the tab", async () => {
    const client = browserQueryClient();
    const { counter, options } = countedSeedsQuery(quotaExceeded);
    await client.fetchQuery(options);
    const unsubscribe = new QueryObserver(client, {
      ...options,
      refetchOnMount: false,
    }).subscribe(() => {});

    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await settle();
    unsubscribe();

    expect(counter.calls).toBe(1);
  });

  it("doesn't retry an unexpected failure", async () => {
    const client = browserQueryClient();
    const { counter, options } = countedSeedsQuery(() =>
      Promise.reject(new Error("Spotify answered 404 to GET /search")),
    );
    const observer = new QueryObserver(client, options);
    const unsubscribe = observer.subscribe(() => {});

    await observer.refetch();
    await settle();
    unsubscribe();

    expect(counter.calls).toBe(1);
  });
});

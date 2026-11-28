import {
  Alert,
  Avatar,
  Button,
  Card,
  Container,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { type } from "arktype";
import type { ReactNode } from "react";
import type { LoomErrorCode } from "@/core/errors";
import type { Seed } from "@/core/seeds";
import { seedCandidatesQuery } from "@/queries/seeds";
import { getLoginState } from "@/server/session";
import { LogoutButton } from "@/ui/LogoutButton";

const SPOTIFY_MESSAGES: Record<string, { color: string; text: string }> = {
  expired: { color: "yellow", text: "That link expired. Try again." },
  limited: {
    color: "yellow",
    text: "Spotify access is limited to five Listeners.",
  },
  denied: { color: "gray", text: "Spotify connection was cancelled." },
  taken: {
    color: "yellow",
    text: "That Spotify account is already connected to another Listener.",
  },
  failed: { color: "red", text: "Connecting Spotify failed. Try again." },
};

const SEED_ERRORS: Record<LoomErrorCode, ReactNode> = {
  not_signed_in: (
    <Alert color="red">You've been signed out. Sign in again.</Alert>
  ),
  spotify_not_connected: (
    <Button component="a" href="/connect/spotify" w="fit-content">
      Connect Spotify
    </Button>
  ),
  spotify_needs_reconnect: (
    <Alert color="yellow">
      <Stack gap="xs" align="flex-start">
        <Text size="sm">
          Spotify's access to your account ran out after 6 months. Reconnect to
          keep using it.
        </Text>
        <Button component="a" href="/connect/spotify">
          Reconnect Spotify
        </Button>
      </Stack>
    </Alert>
  ),
  spotify_quota_exceeded: (
    <Alert color="red">
      Loom has used up its Spotify quota for now. Try again later.
    </Alert>
  ),
  spotify_rate_limited: (
    <Alert color="red">Spotify is busy. Try again in a minute.</Alert>
  ),
  spotify_unavailable: (
    <Alert color="red">Spotify isn't responding. Try again later.</Alert>
  ),
};

export const Route = createFileRoute("/explore")({
  validateSearch: type({ "spotify?": "string", "q?": "string" }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  beforeLoad: async () => {
    const { loggedIn } = await getLoginState();
    if (!loggedIn) throw redirect({ to: "/" });
  },
  // fetchQuery reuses fresh Seeds but refetches a cached error
  loader: async ({ context, deps }) => {
    const result = await context.queryClient.fetchQuery(
      seedCandidatesQuery(deps.q),
    );
    if (!result.ok && result.error === "not_signed_in") {
      throw redirect({ to: "/" });
    }
  },
  component: Explore,
  pendingComponent: ExplorePending,
});

// Shown when Spotify is slow, e.g. a token renewal plus a Retry-After wait
function ExplorePending() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={1}>Explore</Title>
        <Skeleton height={36} />
        <SimpleGrid cols={{ base: 2, sm: 3 }}>
          {Array.from({ length: 6 }, (_, index) => (
            <Card key={index} withBorder padding="sm">
              <Stack align="center" gap="xs">
                <Skeleton height={84} width={84} radius="sm" />
                <Skeleton height={12} width="70%" />
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>
    </Container>
  );
}

function Explore() {
  const { spotify, q } = Route.useSearch();
  const { data: result } = useSuspenseQuery(seedCandidatesQuery(q));
  const message = spotify ? SPOTIFY_MESSAGES[spotify] : undefined;

  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={1}>Explore</Title>
          <LogoutButton />
        </Group>
        {message && <Alert color={message.color}>{message.text}</Alert>}
        {result.ok ? (
          <>
            <SeedSearch q={q} />
            <SeedList seeds={result.value} q={q?.trim()} />
          </>
        ) : (
          SEED_ERRORS[result.error]
        )}
      </Stack>
    </Container>
  );
}

function SeedSearch({ q }: { q?: string }) {
  const navigate = Route.useNavigate();

  return (
    <form
      method="get"
      action="/explore"
      onSubmit={event => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get("q");
        const search = typeof value === "string" ? value : "";
        void navigate({ search: { q: search || undefined } });
      }}
    >
      <Group align="flex-end">
        <TextInput
          name="q"
          label="Find an artist to explore from"
          placeholder="e.g. Big Thief"
          defaultValue={q}
          style={{ flex: 1 }}
        />
        <Button type="submit">Search</Button>
      </Group>
    </form>
  );
}

function SeedList({ seeds, q }: { seeds: Seed[]; q?: string }) {
  if (seeds.length === 0) {
    return (
      <Text c="dimmed">
        {q
          ? `No artists found for “${q}”.`
          : "Spotify has no top artists for you yet. Search for an artist instead."}
      </Text>
    );
  }

  return (
    <Stack gap="xs">
      <Text fw={500}>{q ? `Artists matching “${q}”` : "Your top artists"}</Text>
      <SimpleGrid cols={{ base: 2, sm: 3 }}>
        {seeds.map(seed => (
          <Card key={seed.spotifyId} withBorder padding="sm">
            <Stack align="center" gap="xs">
              <Avatar
                src={seed.imageUrl}
                name={seed.name}
                alt=""
                size="xl"
                radius="sm"
              />
              <Text size="sm" ta="center">
                {seed.name}
              </Text>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

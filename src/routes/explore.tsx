import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  Alert,
  Button,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { type } from "arktype";
import { getSpotifyStatus } from "@/server/connections";
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

// Placeholder until Seed candidates arrive in #5
export const Route = createFileRoute("/explore")({
  validateSearch: type({ "spotify?": "string" }),
  beforeLoad: async () => {
    const { loggedIn } = await getLoginState();
    if (!loggedIn) throw redirect({ to: "/" });
  },
  loader: () => getSpotifyStatus(),
  component: Explore,
});

function Explore() {
  const spotifyStatus = Route.useLoaderData();
  const { spotify } = Route.useSearch();
  const message = spotify ? SPOTIFY_MESSAGES[spotify] : undefined;

  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={1}>Explore</Title>
          <LogoutButton />
        </Group>
        {message && <Alert color={message.color}>{message.text}</Alert>}
        {spotifyStatus === "connected" ? (
          <Text c="dimmed">Spotify connected.</Text>
        ) : (
          <Button component="a" href="/connect/spotify" w="fit-content">
            Connect Spotify
          </Button>
        )}
        <Text c="dimmed">
          You're logged in. Seeds to explore from are coming next.
        </Text>
      </Stack>
    </Container>
  );
}

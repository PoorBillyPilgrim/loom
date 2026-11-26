import { createFileRoute, redirect } from '@tanstack/react-router'
import { Alert, Container, Group, Stack, Text, Title } from '@mantine/core'
import { type } from 'arktype'
import { getLoginState } from '@/server/session'
import { LogoutButton } from '@/ui/LogoutButton'

const SPOTIFY_MESSAGES: Record<string, { color: string; text: string }> = {
  expired: { color: 'yellow', text: 'That link expired. Try again.' },
  limited: { color: 'yellow', text: 'Spotify access is limited to five Listeners.' },
  denied: { color: 'gray', text: 'Spotify connection was cancelled.' },
  failed: { color: 'red', text: 'Connecting Spotify failed. Try again.' },
}

// Placeholder until Seed candidates arrive in #5
export const Route = createFileRoute('/explore')({
  validateSearch: type({ 'spotify?': 'string' }),
  beforeLoad: async () => {
    const { loggedIn } = await getLoginState()
    if (!loggedIn) throw redirect({ to: '/' })
  },
  component: Explore,
})

function Explore() {
  const { spotify } = Route.useSearch()
  const message = spotify ? SPOTIFY_MESSAGES[spotify] : undefined

  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={1}>Explore</Title>
          <LogoutButton />
        </Group>
        {message && <Alert color={message.color}>{message.text}</Alert>}
        <Text c="dimmed">You're logged in. Seeds to explore from are coming next.</Text>
      </Stack>
    </Container>
  )
}

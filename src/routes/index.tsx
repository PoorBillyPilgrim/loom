import { Link, createFileRoute } from '@tanstack/react-router'
import { Alert, Button, Container, Group, Stack, Text, Title } from '@mantine/core'
import { type } from 'arktype'
import { getLoginState } from '@/server/session'
import { LogoutButton } from '@/ui/LogoutButton'

const LOGIN_MESSAGES: Record<string, { color: string; text: string }> = {
  expired: { color: 'yellow', text: 'That login link expired. Try again.' },
  'not-invited': {
    color: 'yellow',
    text: 'Loom is invite-only. Ask Tyler to add your Spotify account.',
  },
  denied: { color: 'gray', text: 'Spotify login was cancelled.' },
  failed: { color: 'red', text: 'Spotify login failed. Try again.' },
}

export const Route = createFileRoute('/')({
  validateSearch: type({ 'login?': 'string' }),
  loader: () => getLoginState(),
  component: Home,
})

function Home() {
  const { loggedIn } = Route.useLoaderData()
  const { login } = Route.useSearch()
  const message = login ? LOGIN_MESSAGES[login] : undefined

  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={1}>Loom</Title>
        <Text c="dimmed">Music recommendations from beyond Spotify, kept in one Inbox.</Text>
        {message && <Alert color={message.color}>{message.text}</Alert>}
        {loggedIn ? (
          <Group>
            <Button component={Link} to="/explore">
              Explore
            </Button>
            <LogoutButton />
          </Group>
        ) : (
          <Button component="a" href="/auth/login" w="fit-content">
            Log in with Spotify
          </Button>
        )}
      </Stack>
    </Container>
  )
}

import { createFileRoute, redirect } from '@tanstack/react-router'
import { Container, Group, Stack, Text, Title } from '@mantine/core'
import { getLoginState } from '@/server/session'
import { LogoutButton } from '@/ui/LogoutButton'

// Placeholder until Seed candidates arrive in #5
export const Route = createFileRoute('/explore')({
  beforeLoad: async () => {
    const { loggedIn } = await getLoginState()
    if (!loggedIn) throw redirect({ to: '/' })
  },
  component: Explore,
})

function Explore() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={1}>Explore</Title>
          <LogoutButton />
        </Group>
        <Text c="dimmed">You're logged in. Seeds to explore from are coming next.</Text>
      </Stack>
    </Container>
  )
}

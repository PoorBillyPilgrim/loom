import { createFileRoute } from '@tanstack/react-router'
import { Button, Container, Stack, Text, Title } from '@mantine/core'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={1}>Loom</Title>
        <Text c="dimmed">Music recommendations from beyond Spotify, kept in one Inbox.</Text>
        <Button component="a" href="/auth/login" w="fit-content">
          Log in with Spotify
        </Button>
      </Stack>
    </Container>
  )
}

import { Button } from '@mantine/core'

export function LogoutButton() {
  return (
    <form method="post" action="/auth/logout">
      <Button type="submit" variant="default">
        Log out
      </Button>
    </form>
  )
}

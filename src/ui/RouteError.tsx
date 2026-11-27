import { Alert, Button, Container, Stack, Text } from "@mantine/core";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";

/** Only for unexpected failures. Spotify problems the Listener can act on are shown by each page */
export function RouteError(_props: ErrorComponentProps) {
  const router = useRouter();
  const { reset } = useQueryErrorResetBoundary();

  // Without this, Try again would rethrow the cached query error straight away
  useEffect(() => {
    reset();
  }, [reset]);

  return (
    <Container size="sm" py="xl">
      <Alert color="red" title="Something went wrong loading this page">
        <Stack gap="xs" align="flex-start">
          <Text size="sm">Try again in a moment.</Text>
          <Button onClick={() => void router.invalidate()}>Try again</Button>
        </Stack>
      </Alert>
    </Container>
  );
}

import { Container, Title, Text, Button, Stack, Paper, Group } from '@mantine/core';
import { materialClasses } from 'shared/ui/design-system';
import classes from './ErrorFallback.module.css';
import { IconAlertTriangle, IconRefresh, IconHome } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, memo } from 'react';

interface ErrorFallbackProps {
  error: Error & { digest?: string };
  reset?: () => void;
  showHomeButton?: boolean;
}

/**
 * Reusable error UI component
 * Used by error.tsx files throughout the app
 */
export const ErrorFallback = memo(({
  error,
  reset,
  showHomeButton = true
}: ErrorFallbackProps) => {
  const navigate = useNavigate();
  const isDevelopment = process.env.NODE_ENV === 'development';

  const handleGoHome = useCallback(() => {
    void navigate({ to: '/' });
  }, [navigate]);

  return (
    <Container size="sm" py="xl">
      <Paper shadow="md" p="xl" radius="md" withBorder className={materialClasses.panel}>
        <Stack align="center" gap="lg">
          <IconAlertTriangle size={64} color="var(--mantine-color-red-6)" />

          <Stack align="center" gap="xs">
            <Title order={2}>Something went wrong</Title>
            <Text c="dimmed" size="sm" ta="center">
              We encountered an unexpected error. Our team has been notified.
            </Text>
          </Stack>

          {/* Show error details in development */}
          {isDevelopment && (
            <Paper bg="gray.0" p="md" radius="sm" w="100%">
              <Text size="xs" fw={600} mb="xs">
                Development Error Details:
              </Text>
              <Text size="xs" c="red" className={classes.errorText}>
                {error.message}
              </Text>
              {error.digest && (
                <Text size="xs" c="dimmed" mt="xs">
                  Error ID: {error.digest}
                </Text>
              )}
            </Paper>
          )}

          {/* Show error digest in production */}
          {!isDevelopment && error.digest && (
            <Text size="xs" c="dimmed">
              Error ID: {error.digest}
            </Text>
          )}

          {/* Action buttons */}
          <Group>
            {reset && (
              <Button
                leftSection={<IconRefresh size={16} />}
                onClick={reset}
                variant="filled"
              >
                Try Again
              </Button>
            )}
            {showHomeButton && (
              <Button
                leftSection={<IconHome size={16} />}
                onClick={handleGoHome}
                variant="light"
              >
                Go Home
              </Button>
            )}
          </Group>
        </Stack>
      </Paper>
    </Container>
  );
});

ErrorFallback.displayName = 'ErrorFallback';

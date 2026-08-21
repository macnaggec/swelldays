import { createFileRoute, Link } from '@tanstack/react-router';
import { Button, Center, Group, Stack, Text, Title } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';

export const Route = createFileRoute('/_page/order-success')({
  component: OrderSuccessPage,
});

/**
 * OrderSuccessPage — shown after CryptoCloud redirects back post-payment.
 *
 * Checkout is authenticated-only, so we simply confirm success and direct
 * the user to their purchases tab where downloads are available.
 */
function OrderSuccessPage() {
  return (
    <Center mih={400}>
      <Stack align="center" gap="md" maw={400} ta="center">
        <Group gap="xs">
          <IconCheck color="var(--mantine-color-green-6)" size={32} />
          <Title order={3}>Payment successful!</Title>
        </Group>

        <Text size="sm" c="dimmed">
          Your files are ready to download from the Purchases tab in your profile.
        </Text>

        <Group gap="sm">
          <Button component={Link} to="/me/collections/purchases">
            Go to Purchases
          </Button>
          <Button component={Link} to="/" variant="subtle">
            Back to home
          </Button>
        </Group>
      </Stack>
    </Center>
  );
}

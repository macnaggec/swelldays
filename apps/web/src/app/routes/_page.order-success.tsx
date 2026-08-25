import { createFileRoute, Link } from '@tanstack/react-router';
import { Center, Group, Stack, Text, Title } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { AppButton } from 'shared/ui/AppButton';

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
          <AppButton
            tone="positive"
            renderRoot={(props) => <Link {...props} to="/me/collections/purchases" />}
          >
            Go to Purchases
          </AppButton>
          <AppButton renderRoot={(props) => <Link {...props} to="/" />}>
            Back to home
          </AppButton>
        </Group>
      </Stack>
    </Center>
  );
}

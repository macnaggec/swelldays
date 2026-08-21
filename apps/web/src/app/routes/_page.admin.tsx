import { createFileRoute } from '@tanstack/react-router';
import {
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconCheck, IconCreditCard, IconPlayerPlay, IconX } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import { LoginForm } from 'features/Auth';
import { useUser } from 'shared/hooks/useUser';
import { formatPrice } from 'shared/lib/currency';
import { formatShortDate } from 'shared/lib/dateUtils';
import { notify } from 'shared/lib/notifications';
import { getErrorMessage } from 'shared/lib/getErrorMessage';
import { useTRPC } from 'shared/lib/trpc';

export const Route = createFileRoute('/_page/admin')({
  component: AdminPage,
});

// This page uses Mantine's plain light background (see _page.module.css), unlike
// the rest of the app's dark glass surfaces that the shared Input theme override
// in app/lib/theme.ts is tuned for. Override locally rather than touching that
// global override, which every other (correctly dark) input in the app relies on.
const LIGHT_INPUT_STYLES = {
  input: {
    color: 'var(--mantine-color-black)',
    background: 'var(--mantine-color-white)',
    border: '1px solid var(--mantine-color-gray-4)',
    caretColor: 'var(--mantine-color-black)',
    '&::placeholder': {
      color: 'var(--mantine-color-gray-6)',
    },
    '&:focus': {
      borderColor: 'var(--mantine-primary-color-filled)',
    },
  },
} as const;

function AdminPage() {
  const { isAuthenticated, isLoading } = useUser();
  const trpc = useTRPC();
  const handleLoginSuccess = useCallback(() => {}, []);
  // Reuses the existing admin-only payouts query purely as an access check —
  // it's already gated server-side by adminProcedure, so a non-admin gets a
  // FORBIDDEN error here before ever seeing the admin shell below. Adding a
  // dedicated "am I admin" endpoint isn't warranted for a single admin feature.
  const { isError: isForbidden, isLoading: isCheckingAccess } = useQuery({
    ...trpc.admin.ledger.listPayouts.queryOptions(),
    enabled: isAuthenticated,
  });

  if (isLoading || (isAuthenticated && isCheckingAccess)) {
    return (
      <Center mih={400}>
        <Loader size="sm" />
      </Center>
    );
  }

  if (!isAuthenticated || isForbidden) {
    return (
      <Center mih={520}>
        <Stack gap="lg" maw={420} w="100%">
          <Stack gap={4} align="center">
            <Title order={2}>Admin</Title>
            <Text c="dimmed" size="sm" ta="center">
              Sign in with an admin account to manage marketplace operations.
            </Text>
          </Stack>
          <Paper shadow="md" p="xl" radius="md" withBorder>
            <LoginForm onSuccess={handleLoginSuccess} />
          </Paper>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack p="xl" gap="lg">
      <Stack gap={4}>
        <Title order={2}>Admin</Title>
        <Text c="dimmed" size="sm">
          Internal operator tools for marketplace operations.
        </Text>
      </Stack>

      <Tabs defaultValue="payouts" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="payouts" leftSection={<IconCreditCard size={16} />}>
            Payouts
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="payouts" pt="lg">
          <AdminPayoutsPanel />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function AdminPayoutsPanel() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: payouts = [], isError, isLoading } = useQuery(trpc.admin.ledger.listPayouts.queryOptions());
  const markProcessing = useMutation(trpc.admin.ledger.markProcessing.mutationOptions());
  const complete = useMutation(trpc.admin.ledger.complete.mutationOptions());
  const reject = useMutation(trpc.admin.ledger.reject.mutationOptions());
  const [externalTransferIds, setExternalTransferIds] = useState<Record<string, string>>({});
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const isMutating = markProcessing.isPending || complete.isPending || reject.isPending;

  const activePayouts = payouts.filter(
    (payout) => payout.status === 'PENDING' || payout.status === 'PROCESSING',
  );
  const historyPayouts = payouts
    .filter((payout) => payout.status === 'COMPLETED' || payout.status === 'REJECTED')
    .sort((a, b) => {
      const aTime = new Date(a.processedAt ?? a.requestedAt).getTime();
      const bTime = new Date(b.processedAt ?? b.requestedAt).getTime();
      return bTime - aTime;
    });

  const refreshPayouts = () =>
    queryClient.invalidateQueries({ queryKey: trpc.admin.ledger.listPayouts.queryKey() });

  const handleAction = async (
    action: () => Promise<unknown>,
    successMessage: string,
  ) => {
    try {
      await action();
      await refreshPayouts();
      notify.success(successMessage, 'Payout Updated');
    } catch (error) {
      notify.error(getErrorMessage(error), 'Payout Update Failed');
    }
  };

  if (isLoading) {
    return (
      <Center mih={240}>
        <Loader size="sm" />
      </Center>
    );
  }

  if (isError) {
    return (
      <Center mih={240}>
        <Stack gap={4} ta="center">
          <Title order={3}>Access denied</Title>
          <Text c="dimmed" size="sm">This account is not allowed to manage payouts.</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={3}>Admin payouts</Title>
        <Text c="dimmed" size="sm">
          Review payout requests and record manual transfer outcomes.
        </Text>
      </Stack>

      <Stack gap={4}>
        <Text size="sm" fw={600}>Needs action</Text>
        <Paper shadow="xs" p="lg" radius="md" withBorder>
          {activePayouts.length === 0 ? (
            <Center mih={240}>
              <Text c="dimmed" size="sm">No payout requests need action.</Text>
            </Center>
          ) : (
          <Table.ScrollContainer minWidth={900}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Photographer</Table.Th>
                  <Table.Th>Amount</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Requested</Table.Th>
                  <Table.Th>Complete</Table.Th>
                  <Table.Th>Reject</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {activePayouts.map((payout) => {
                  const externalTransferId = externalTransferIds[payout.id] ?? '';
                  const rejectNote = rejectNotes[payout.id] ?? '';
                  const canComplete = payout.status === 'PROCESSING' && externalTransferId.trim().length > 0;
                  const canReject = rejectNote.trim().length > 0;

                  return (
                    <Table.Tr key={payout.id}>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text size="sm" fw={600}>{payout.photographer.name ?? 'Unnamed photographer'}</Text>
                          <Text size="xs" c="dimmed">{payout.photographer.email}</Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600}>{formatPrice(payout.amount)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={payout.status === 'PROCESSING' ? 'blue' : 'gray'} variant="light">
                          {formatStatus(payout.status)}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{formatShortDate(payout.requestedAt)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          aria-label={`External transfer id for ${payout.photographer.email}`}
                          disabled={payout.status !== 'PROCESSING' || isMutating}
                          placeholder="Transfer id"
                          value={externalTransferId}
                          styles={LIGHT_INPUT_STYLES}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setExternalTransferIds((current) => ({
                              ...current,
                              [payout.id]: value,
                            }));
                          }}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Textarea
                          aria-label={`Reject note for ${payout.photographer.email}`}
                          autosize
                          disabled={isMutating}
                          minRows={1}
                          placeholder="Reason"
                          value={rejectNote}
                          styles={LIGHT_INPUT_STYLES}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setRejectNotes((current) => ({
                              ...current,
                              [payout.id]: value,
                            }));
                          }}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Button
                            leftSection={<IconPlayerPlay size={16} />}
                            disabled={payout.status !== 'PENDING' || isMutating}
                            size="xs"
                            variant="light"
                            onClick={() => {
                              void handleAction(
                                () => markProcessing.mutateAsync({ payoutRequestId: payout.id }),
                                'Payout marked processing.',
                              );
                            }}
                          >
                            Mark processing
                          </Button>
                          <Button
                            leftSection={<IconCheck size={16} />}
                            disabled={!canComplete || isMutating}
                            size="xs"
                            variant="light"
                            onClick={() => {
                              void handleAction(
                                () => complete.mutateAsync({
                                  payoutRequestId: payout.id,
                                  externalTransferId: externalTransferId.trim(),
                                }),
                                'Payout completed.',
                              );
                            }}
                          >
                            Complete
                          </Button>
                          <Button
                            color="red"
                            leftSection={<IconX size={16} />}
                            disabled={!canReject || isMutating}
                            size="xs"
                            variant="light"
                            onClick={() => {
                              void handleAction(
                                () => reject.mutateAsync({
                                  payoutRequestId: payout.id,
                                  note: rejectNote.trim(),
                                }),
                                'Payout rejected.',
                              );
                            }}
                          >
                            Reject
                          </Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          )}
        </Paper>
      </Stack>

      <Stack gap={4}>
        <Text size="sm" fw={600}>History</Text>
        <Paper shadow="xs" p="lg" radius="md" withBorder>
          {historyPayouts.length === 0 ? (
            <Center mih={160}>
              <Text c="dimmed" size="sm">Completed and rejected payouts will appear here.</Text>
            </Center>
          ) : (
          <Table.ScrollContainer minWidth={700}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Photographer</Table.Th>
                  <Table.Th>Amount</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Processed</Table.Th>
                  <Table.Th>Detail</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {historyPayouts.map((payout) => (
                  <Table.Tr key={payout.id}>
                    <Table.Td>
                      <Stack gap={2}>
                        <Text size="sm" fw={600}>{payout.photographer.name ?? 'Unnamed photographer'}</Text>
                        <Text size="xs" c="dimmed">{payout.photographer.email}</Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={600}>{formatPrice(payout.amount)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={payout.status === 'COMPLETED' ? 'green' : 'red'} variant="light">
                        {formatStatus(payout.status)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{payout.processedAt ? formatShortDate(payout.processedAt) : '—'}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {payout.status === 'COMPLETED' ? payout.externalTransferId : payout.note}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          )}
        </Paper>
      </Stack>
    </Stack>
  );
}

function formatStatus(status: string): string {
  return status
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

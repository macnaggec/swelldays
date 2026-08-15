import { useState } from 'react';
import { Button, Checkbox, Group, Modal, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconClockHour4 } from '@tabler/icons-react';
import { formatPrice } from 'shared/lib/currency';
import materials from 'shared/ui/design-system/materials.module.css';
import classes from './DeleteAccountPanel.module.css';

export interface DeleteAccountPanelProps {
  availableBalanceCents: number;
  pendingPayoutCents: number;
  payoutThresholdCents: number;
  isDeleting: boolean;
  onDelete: () => void;
  onRequestPayout: () => void;
}

/**
 * Which exit a photographer gets, given what the platform still owes them:
 * - blocked: a payout is mid-flight and could still be refunded to the balance
 * - clean: nothing owed, nothing to forfeit
 * - forfeitOnly: owed less than the payout minimum, so it cannot be withdrawn
 * - payoutOrForfeit: owed enough to withdraw, so the choice is theirs
 */
type ExitPath = 'blocked' | 'clean' | 'forfeitOnly' | 'payoutOrForfeit';

function toExitPath({
  availableBalanceCents,
  pendingPayoutCents,
  payoutThresholdCents,
}: Pick<
  DeleteAccountPanelProps,
  'availableBalanceCents' | 'pendingPayoutCents' | 'payoutThresholdCents'
>): ExitPath {
  if (pendingPayoutCents > 0) return 'blocked';
  if (availableBalanceCents <= 0) return 'clean';
  if (availableBalanceCents < payoutThresholdCents) return 'forfeitOnly';
  return 'payoutOrForfeit';
}

export function DeleteAccountPanel({
  availableBalanceCents,
  pendingPayoutCents,
  payoutThresholdCents,
  isDeleting,
  onDelete,
  onRequestPayout,
}: DeleteAccountPanelProps) {
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [hasAcceptedForfeit, setAcceptedForfeit] = useState(false);

  const exitPath = toExitPath({
    availableBalanceCents,
    pendingPayoutCents,
    payoutThresholdCents,
  });
  const forfeits = exitPath === 'forfeitOnly' || exitPath === 'payoutOrForfeit';
  const canDelete = exitPath !== 'blocked' && (!forfeits || hasAcceptedForfeit);

  const closeConfirm = () => {
    setConfirmOpen(false);
    setAcceptedForfeit(false);
  };

  const forfeitConsent = (
    <Checkbox
      checked={hasAcceptedForfeit}
      onChange={(event) => setAcceptedForfeit(event.currentTarget.checked)}
      label={`I understand my ${formatPrice(availableBalanceCents)} balance will be forfeited`}
    />
  );

  return (
    <section className={`${materials.panel} ${classes.root}`} aria-label="Delete account">
      <div>
        <Text component="h2" className={classes.title}>
          Delete account
        </Text>
        <Text className={classes.description}>
          Permanently deletes your account and removes your published photos from sale. Photos
          people have already bought stay available to them. This cannot be undone.
        </Text>
      </div>

      <Button
        className={classes.deleteAction}
        variant="default"
        radius="md"
        leftSection={<IconAlertTriangle size={17} stroke={1.8} />}
        onClick={() => setConfirmOpen(true)}
      >
        Delete account
      </Button>

      <Modal opened={isConfirmOpen} onClose={closeConfirm} title="Delete account" centered>
        <Stack gap="md">
          {exitPath === 'blocked' && (
            <div className={classes.notice}>
              <IconClockHour4 className={classes.noticeIcon} size={18} stroke={1.7} />
              <div>
                <Text className={classes.noticeTitle}>Payout in progress</Text>
                <Text className={classes.noticeBody}>
                  You have {formatPrice(pendingPayoutCents)} being paid out right now. You can
                  delete your account once it finishes.
                </Text>
              </div>
            </div>
          )}

          {exitPath === 'clean' && (
            <Text className={classes.modalBody}>
              This permanently deletes your account and removes your published photos from sale.
              This cannot be undone.
            </Text>
          )}

          {exitPath === 'forfeitOnly' && (
            <>
              <Text className={classes.modalBody}>
                Your balance of{' '}
                <span className={classes.forfeitAmount}>{formatPrice(availableBalanceCents)}</span>{' '}
                is below the {formatPrice(payoutThresholdCents)} payout minimum, so it cannot be
                withdrawn. Deleting your account forfeits it.
              </Text>
              {forfeitConsent}
            </>
          )}

          {exitPath === 'payoutOrForfeit' && (
            <>
              <Text className={classes.modalBody}>
                You have{' '}
                <span className={classes.forfeitAmount}>{formatPrice(availableBalanceCents)}</span>{' '}
                available. You can request a payout first and delete your account once it clears, or
                delete now and forfeit it.
              </Text>
              {forfeitConsent}
            </>
          )}

          <Group justify="flex-end" gap="sm">
            <Button variant="default" radius="md" onClick={closeConfirm}>
              Cancel
            </Button>

            {exitPath === 'payoutOrForfeit' && (
              <Button variant="default" radius="md" onClick={onRequestPayout}>
                Request payout instead
              </Button>
            )}

            {exitPath !== 'blocked' && (
              <Button
                className={classes.deleteAction}
                variant="default"
                radius="md"
                disabled={!canDelete || isDeleting}
                loading={isDeleting}
                onClick={onDelete}
              >
                {forfeits ? 'Delete and forfeit' : 'Delete account'}
              </Button>
            )}
          </Group>
        </Stack>
      </Modal>
    </section>
  );
}

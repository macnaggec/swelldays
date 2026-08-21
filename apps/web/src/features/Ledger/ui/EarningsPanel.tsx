import { Badge, Button, Skeleton, Text, ThemeIcon } from '@mantine/core';
import {
  IconAlertCircle,
  IconCash,
  IconClockHour4,
  IconReceipt,
  IconRefresh,
  IconTargetArrow,
} from '@tabler/icons-react';
import { formatPrice } from 'shared/lib/currency';
import materials from 'shared/ui/design-system/materials.module.css';
import PayoutRequestRow, { type PayoutRequestRowItem } from './PayoutRequestRow';
import classes from './EarningsPanel.module.css';

export interface EarningsSummary {
  availableBalanceCents: number;
  pendingPayoutCents: number;
  payoutThresholdCents: number;
  payoutRequests: PayoutRequestRowItem[];
}

export interface EarningsPanelProps {
  summary: EarningsSummary;
  isRequestingPayout: boolean;
  onRequestPayout: () => void;
}

export function EarningsPanel({
  summary,
  isRequestingPayout,
  onRequestPayout,
}: EarningsPanelProps) {
  const canRequestPayout = summary.availableBalanceCents >= summary.payoutThresholdCents;
  const remainingToPayoutCents = Math.max(
    0,
    summary.payoutThresholdCents - summary.availableBalanceCents,
  );

  return (
    <section className={classes.root} aria-label="Earnings summary">
      <div className={classes.summaryGrid}>
        <div className={`${materials.panel} ${classes.balanceCard}`}>
          <div className={classes.balanceHeader}>
            <div>
              <Text className={classes.metricLabel}>Available balance</Text>
              <Text className={classes.balanceAmount}>
                {formatPrice(summary.availableBalanceCents)}
              </Text>
            </div>

            <Badge variant="light" color={canRequestPayout ? 'green' : 'gray'}>
              {canRequestPayout ? 'Ready to request' : 'Building balance'}
            </Badge>
          </div>

          <Text className={classes.balanceMessage}>
            {canRequestPayout
              ? 'Your balance meets the payout minimum.'
              : `Earn ${formatPrice(remainingToPayoutCents)} more to request a payout.`}
          </Text>

          <Button
            className={materials.primaryAction}
            radius="md"
            disabled={!canRequestPayout || isRequestingPayout}
            leftSection={<IconCash size={17} stroke={1.8} />}
            loading={isRequestingPayout}
            onClick={onRequestPayout}
          >
            Request payout
          </Button>
        </div>

        <div className={classes.supportingMetrics}>
          <div className={`${materials.panel} ${classes.metricCard}`}>
            <ThemeIcon className={classes.metricIcon} variant="light" color="gray" radius="md">
              <IconClockHour4 size={18} stroke={1.7} />
            </ThemeIcon>
            <div>
              <Text className={classes.metricLabel}>Pending payout</Text>
              <Text className={classes.metricValue}>
                {formatPrice(summary.pendingPayoutCents)}
              </Text>
              <Text className={classes.metricDescription}>
                Requested funds still being processed.
              </Text>
            </div>
          </div>

          <div className={`${materials.panel} ${classes.metricCard}`}>
            <ThemeIcon className={classes.metricIcon} variant="light" color="gray" radius="md">
              <IconTargetArrow size={18} stroke={1.7} />
            </ThemeIcon>
            <div>
              <Text className={classes.metricLabel}>Payout minimum</Text>
              <Text className={classes.metricValue}>
                {formatPrice(summary.payoutThresholdCents)}
              </Text>
              <Text className={classes.metricDescription}>
                Payouts unlock at {formatPrice(summary.payoutThresholdCents)}.
              </Text>
            </div>
          </div>
        </div>
      </div>

      <section
        className={`${materials.panel} ${classes.historySection}`}
        aria-labelledby="payout-history-title"
      >
        <div className={classes.historyHeader}>
          <Text id="payout-history-title" component="h2" className={classes.historyTitle}>
            Payout history
          </Text>
          <Text className={classes.historyDescription}>
            Track requested payouts and their current status.
          </Text>
        </div>

        {summary.payoutRequests.length === 0 ? (
          <div className={classes.emptyHistory}>
            <ThemeIcon className={classes.emptyIcon} variant="light" color="gray" radius="md">
              <IconReceipt size={20} stroke={1.6} />
            </ThemeIcon>
            <div>
              <Text className={classes.emptyTitle}>No payout requests yet</Text>
              <Text className={classes.historyDescription}>
                Payout requests will appear here.
              </Text>
            </div>
          </div>
        ) : (
          <div className={classes.historyList} role="list">
            <div className={classes.historyColumns} aria-hidden="true">
              <Text>Date</Text>
              <Text>Status</Text>
              <Text ta="right">Amount</Text>
            </div>
            {summary.payoutRequests.map((request) => (
              <PayoutRequestRow key={request.id} request={request} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

export function EarningsPanelSkeleton() {
  return (
    <section className={classes.root} aria-busy="true">
      <Text className={classes.screenReaderOnly}>Loading your earnings</Text>

      <div className={classes.summaryGrid}>
        <div className={`${materials.panel} ${classes.balanceCard} ${classes.skeletonCard}`}>
          <Skeleton height={13} width={112} radius="sm" />
          <Skeleton height={44} width={180} radius="sm" />
          <Skeleton height={13} width="64%" radius="sm" />
          <Skeleton height={36} width={150} radius="md" />
        </div>

        <div className={classes.supportingMetrics}>
          {[0, 1].map((item) => (
            <div key={item} className={`${materials.panel} ${classes.metricCard}`}>
              <Skeleton height={34} width={34} radius="md" />
              <div className={classes.metricSkeletonCopy}>
                <Skeleton height={11} width="58%" radius="sm" />
                <Skeleton height={25} width="42%" radius="sm" />
                <Skeleton height={11} width="86%" radius="sm" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`${materials.panel} ${classes.historySection}`}>
        <div className={classes.historyHeader}>
          <Skeleton height={20} width={126} radius="sm" />
          <Skeleton height={12} width={254} radius="sm" />
        </div>
        <div className={classes.skeletonRows}>
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} height={52} radius="sm" />
          ))}
        </div>
      </div>
    </section>
  );
}

export function EarningsPanelError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className={`${materials.panel} ${classes.errorState}`}>
      <ThemeIcon variant="light" color="red" radius="md" size={42}>
        <IconAlertCircle size={22} stroke={1.7} />
      </ThemeIcon>
      <div>
        <Text component="h2" className={classes.errorTitle}>
          Unable to load earnings
        </Text>
        <Text className={classes.errorMessage}>{message}</Text>
      </div>
      <Button
        className={materials.controlButton}
        variant="default"
        radius="md"
        leftSection={<IconRefresh size={16} stroke={1.8} />}
        onClick={onRetry}
      >
        Try again
      </Button>
    </div>
  );
}

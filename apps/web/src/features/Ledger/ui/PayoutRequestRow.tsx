import { memo } from 'react';
import { Badge, Text } from '@mantine/core';
import { formatPrice } from 'shared/lib/currency';
import { formatShortDate } from 'shared/lib/dateUtils';
import classes from './PayoutRequestRow.module.css';

export interface PayoutRequestRowItem {
  id: string;
  amountCents: number;
  status: string;
  requestedAt: Date;
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'gray',
  PROCESSING: 'blue',
  COMPLETED: 'green',
  REJECTED: 'red',
};

function formatPayoutStatus(status: string): string {
  return status
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function PayoutRequestRow({ request }: { request: PayoutRequestRowItem }) {
  return (
    <div className={classes.row} role="listitem">
      <Text className={classes.date}>{formatShortDate(request.requestedAt)}</Text>
      <Badge
        className={classes.status}
        size="sm"
        variant="light"
        color={STATUS_COLOR[request.status] ?? 'gray'}
      >
        {formatPayoutStatus(request.status)}
      </Badge>
      <Text className={classes.amount}>{formatPrice(request.amountCents)}</Text>
    </div>
  );
}

export default memo(PayoutRequestRow);

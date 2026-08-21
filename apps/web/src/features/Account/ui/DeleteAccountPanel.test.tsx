import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { DeleteAccountPanel } from './DeleteAccountPanel';

const defaults = {
  availableBalanceCents: 0,
  pendingPayoutCents: 0,
  payoutThresholdCents: 2000,
  isDeleting: false,
};

const openConfirm = async (props: Partial<typeof defaults> = {}) => {
  const onDelete = vi.fn();
  const onRequestPayout = vi.fn();

  render(
    <DeleteAccountPanel
      {...defaults}
      {...props}
      onDelete={onDelete}
      onRequestPayout={onRequestPayout}
    />,
  );

  await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));

  return { onDelete, onRequestPayout, dialog: within(screen.getByRole('dialog')) };
};

describe('DeleteAccountPanel', () => {
  it('deletes without a forfeit consent step when nothing is owed', async () => {
    const { onDelete, dialog } = await openConfirm();

    expect(dialog.queryByRole('checkbox')).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole('button', { name: 'Delete account' }));

    expect(onDelete).toHaveBeenCalled();
  });

  it('offers forfeit only below the payout minimum, since the balance cannot be withdrawn', async () => {
    const { onDelete, dialog } = await openConfirm({ availableBalanceCents: 500 });

    expect(dialog.getByText(/below the \$20\.00 payout minimum/)).toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Request payout instead' })).not.toBeInTheDocument();

    const deleteButton = dialog.getByRole('button', { name: 'Delete and forfeit' });
    expect(deleteButton).toBeDisabled();

    await userEvent.click(dialog.getByRole('checkbox', { name: /\$5\.00 balance will be forfeited/ }));
    await userEvent.click(deleteButton);

    expect(onDelete).toHaveBeenCalled();
  });

  it('offers a payout or a consented forfeit once the balance clears the minimum', async () => {
    const { onDelete, onRequestPayout, dialog } = await openConfirm({ availableBalanceCents: 4500 });

    expect(dialog.getByRole('button', { name: 'Delete and forfeit' })).toBeDisabled();

    await userEvent.click(dialog.getByRole('button', { name: 'Request payout instead' }));
    expect(onRequestPayout).toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(dialog.getByRole('checkbox', { name: /\$45\.00 balance will be forfeited/ }));
    await userEvent.click(dialog.getByRole('button', { name: 'Delete and forfeit' }));

    expect(onDelete).toHaveBeenCalled();
  });

  it('blocks deletion while a payout is in flight', async () => {
    const { dialog } = await openConfirm({ pendingPayoutCents: 4500 });

    expect(dialog.getByText(/\$45\.00 being paid out right now/)).toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Delete and forfeit' })).not.toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument();
  });
});

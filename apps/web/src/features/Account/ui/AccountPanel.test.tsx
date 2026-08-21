import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { AccountPanel, type AccountPanelProps } from './AccountPanel';

const defaults: AccountPanelProps = {
  identity: { name: 'Kai Holt', email: 'kai@example.com', image: null },
  availableBalanceCents: 0,
  pendingPayoutCents: 0,
  payoutThresholdCents: 2000,
  isDeleting: false,
  onDelete: vi.fn(),
  onRequestPayout: vi.fn(),
};

describe('AccountPanel', () => {
  it('identifies the signed-in account by name and email', () => {
    render(<AccountPanel {...defaults} />);

    expect(screen.getByText('Kai Holt')).toBeInTheDocument();
    expect(screen.getByText('kai@example.com')).toBeInTheDocument();
  });

  it('falls back to the email when the account has no name set', () => {
    render(<AccountPanel {...defaults} identity={{ name: null, email: 'kai@example.com' }} />);

    expect(screen.getByText('Your account')).toBeInTheDocument();
    expect(screen.getByText('kai@example.com')).toBeInTheDocument();
    expect(screen.getByText('KA')).toBeInTheDocument();
  });
});

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { PanelQueryError } from './PanelQueryError';

describe('PanelQueryError', () => {
  it('renders the given title and description with a retry action', () => {
    const onRetry = vi.fn();

    render(
      <PanelQueryError
        title="Couldn't load the gallery"
        description="Something went wrong loading these photos. Try again."
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('heading', { name: "Couldn't load the gallery" })).toBeInTheDocument();
    expect(screen.getByText('Something went wrong loading these photos. Try again.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});

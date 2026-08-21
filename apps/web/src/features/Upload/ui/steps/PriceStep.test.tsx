import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it, vi } from 'vitest';
import { PriceStep } from './PriceStep';

function renderPriceStep(overrides: Partial<ComponentProps<typeof PriceStep>> = {}) {
  return render(
    <MantineProvider>
      <PriceStep
        hasTriedPublish={false}
        photoPrice={300}
        videoPrice={500}
        onPhotoPriceChange={vi.fn()}
        onVideoPriceChange={vi.fn()}
        onPhotoPriceCommit={vi.fn()}
        onVideoPriceCommit={vi.fn()}
        {...overrides}
      />
    </MantineProvider>,
  );
}

describe('PriceStep', () => {
  it('shows both price controls by default', () => {
    renderPriceStep();

    expect(screen.getByDisplayValue('$3')).not.toBeNull();
    expect(screen.getByDisplayValue('$5')).not.toBeNull();
  });

  it('hides the video price control when the session has no video content', () => {
    renderPriceStep({ showVideoPrice: false });

    expect(screen.getByDisplayValue('$3')).not.toBeNull();
    expect(screen.queryByDisplayValue('$5')).toBeNull();
  });

  it('hides the photo price control when the session has no photo content', () => {
    renderPriceStep({ showPhotoPrice: false });

    expect(screen.queryByDisplayValue('$3')).toBeNull();
    expect(screen.getByDisplayValue('$5')).not.toBeNull();
  });

  it('marks valid price inputs with the spot-style ready rail', () => {
    renderPriceStep();

    const photoPrice = screen.getByDisplayValue('$3');
    const videoPrice = screen.getByDisplayValue('$5');

    expect(photoPrice).toHaveAttribute('data-ready', 'true');
    expect(videoPrice).toHaveAttribute('data-ready', 'true');
    expect(photoPrice).toHaveStyle({ boxShadow: 'inset 3px 0 0 var(--wa-accent-spot)' });
    expect(videoPrice).toHaveStyle({ boxShadow: 'inset 3px 0 0 var(--wa-accent-spot)' });
    expect(photoPrice.getAttribute('style')).toContain('border: 1px solid var(--wa-control-border)');
    expect(videoPrice.getAttribute('style')).toContain('border: 1px solid var(--wa-control-border)');
  });

  it('uses the spot-style danger rail only on an invalid price after publish is attempted', () => {
    renderPriceStep({ hasTriedPublish: true, photoPrice: 200 });

    const invalidPhotoPrice = screen.getByDisplayValue('$2');
    expect(invalidPhotoPrice).toHaveStyle({ boxShadow: 'inset 3px 0 0 var(--wa-status-danger)' });
    expect(invalidPhotoPrice.getAttribute('style')).toContain('border: 1px solid var(--wa-control-border)');
    expect(screen.getByDisplayValue('$5')).toHaveAttribute('data-ready', 'true');
    expect(screen.getByText('Min $3')).not.toBeNull();
  });
});

import { readFileSync } from 'node:fs';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { AppButton } from './AppButton';

const appButtonCss = readFileSync('apps/web/src/shared/ui/AppButton/AppButton.module.css', 'utf8');

describe('AppButton', () => {
  it('renders the Upload-style neutral action by default', () => {
    render(<AppButton>Upload</AppButton>);

    const button = screen.getByRole('button', { name: 'Upload' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-app-button-tone', 'neutral');
  });

  it.each(['neutral', 'highlight', 'positive', 'destructive'] as const)(
    'publishes the %s semantic tone to the style seam',
    (tone) => {
      render(<AppButton tone={tone}>Continue</AppButton>);

      expect(screen.getByRole('button', { name: 'Continue' }))
        .toHaveAttribute('data-app-button-tone', tone);
    },
  );

  it('neutralizes and locks every tone when disabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <AppButton tone="destructive" disabled onClick={onClick}>
        Delete
      </AppButton>,
    );

    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-app-button-disabled', 'true');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows pending content without changing the button geometry seam', () => {
    render(<AppButton loading>Publish</AppButton>);

    const button = screen.getByRole('button', { name: 'Publish' });
    expect(button).toHaveAttribute('data-app-button-loading', 'true');
    expect(button).toBeDisabled();
  });

  it('supports submit actions and leading content without styling props at the call site', () => {
    render(
      <AppButton type="submit" leftSection={<span data-testid="leading-icon" />}>
        Checkout
      </AppButton>,
    );

    expect(screen.getByRole('button', { name: 'Checkout' })).toHaveAttribute('type', 'submit');
    expect(screen.getByTestId('leading-icon')).toBeInTheDocument();
  });

  it('allows an explicit status indicator to overhang without loosening every button', () => {
    render(
      <AppButton indicator={<span data-testid="status-indicator" />}>
        Upload
      </AppButton>,
    );

    const button = screen.getByRole('button', { name: 'Upload' });
    expect(button).toHaveAttribute('data-app-button-indicator', 'true');
    expect(screen.getByTestId('status-indicator')).toBeInTheDocument();
    expect(appButtonCss).toContain("[data-app-button-indicator='true']");
  });

  it('owns the Upload pill geometry and responsive control height', () => {
    expect(appButtonCss).toContain('height: var(--wa-control-height-default)');
    expect(appButtonCss).toContain('padding-inline: 10px');
    expect(appButtonCss).toContain('border-radius: var(--wa-radius-pill)');
    expect(appButtonCss).toContain('width: fit-content');
  });

  it('owns one centralized color recipe for every semantic tone and disabled state', () => {
    expect(appButtonCss).toContain("[data-app-button-tone='highlight']");
    expect(appButtonCss).toContain("[data-app-button-tone='positive']");
    expect(appButtonCss).toContain("[data-app-button-tone='destructive']");
    expect(appButtonCss).toContain('var(--wa-accent-spot)');
    expect(appButtonCss).toContain('var(--wa-status-success)');
    expect(appButtonCss).toContain('var(--wa-status-danger)');
    expect(appButtonCss).toContain(':where(:disabled, [data-disabled])');
  });

  it('gives disabled buttons a dedicated override that removes every tone glow', () => {
    const disabledRule = appButtonCss.match(
      /\.root\[data-app-button-disabled='true'\]\s*\{(?<declarations>[^}]*)\}/,
    );

    expect(disabledRule?.groups?.declarations ?? '').toContain('box-shadow: none');
  });

  it('keeps enabled tone shadows tight and low-opacity', () => {
    const toneShadows = [...appButtonCss.matchAll(
      /box-shadow:\s*0\s+(?<offset>\d+)px\s+(?<blur>\d+)px\s+color-mix\(in srgb, var\(--wa-(?:accent-spot|status-success|status-danger)\) (?<strength>\d+)%, transparent\);/g,
    )];

    expect(toneShadows).toHaveLength(6);
    for (const shadow of toneShadows) {
      expect(Number(shadow.groups?.offset)).toBeLessThanOrEqual(4);
      expect(Number(shadow.groups?.blur)).toBeLessThanOrEqual(14);
      expect(Number(shadow.groups?.strength)).toBeLessThanOrEqual(18);
    }
  });
});

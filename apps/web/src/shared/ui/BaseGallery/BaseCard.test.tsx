import { render, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it, vi } from 'vitest';
import BaseCard from './BaseCard';

function wrap(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe('BaseCard', () => {
  it('renders <img> with the imageUrl for image resources', () => {
    const { container } = wrap(
      <BaseCard imageUrl="https://cdn.example.com/photo.jpg" resourceType="image" alt="Test photo" />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('https://cdn.example.com/photo.jpg');
    expect(container.querySelector('video')).toBeNull();
  });

  it('renders <img> with the poster frame URL for video resources', () => {
    const posterUrl = 'https://cdn.example.com/poster.jpg';
    const { container } = wrap(
      <BaseCard imageUrl={posterUrl} resourceType="video" alt="Test video" />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe(posterUrl);
    expect(container.querySelector('video')).toBeNull();
  });

  it('renders a muted <video> from videoPreviewUrl when imageUrl is still empty (video mid-upload)', () => {
    const blobUrl = 'blob:local-video-preview';
    const { container } = wrap(
      <BaseCard imageUrl="" videoPreviewUrl={blobUrl} resourceType="video" alt="Test video" />,
    );
    expect(container.querySelector('img')).toBeNull();
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video!.getAttribute('src')).toBe(blobUrl);
    expect(video!.muted).toBe(true);
  });

  it('ignores videoPreviewUrl once imageUrl is set', () => {
    const posterUrl = 'https://cdn.example.com/poster.jpg';
    const { container } = wrap(
      <BaseCard imageUrl={posterUrl} videoPreviewUrl="blob:stale" resourceType="video" alt="Test video" />,
    );
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img')!.getAttribute('src')).toBe(posterUrl);
  });

  it('shows a play indicator for video resources', () => {
    const { container } = wrap(
      <BaseCard imageUrl="https://cdn.example.com/poster.jpg" resourceType="video" />,
    );
    // The videoIndicator div contains the play icon svg
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('does not show a play indicator for image resources', () => {
    const { container } = wrap(
      <BaseCard imageUrl="https://cdn.example.com/photo.jpg" resourceType="image" />,
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('swaps a broken image for the fallback placeholder on load error', () => {
    const { container, getByLabelText } = wrap(
      <BaseCard imageUrl="https://cdn.example.com/missing.jpg" resourceType="image" alt="Test photo" />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();

    fireEvent.error(img!);

    expect(container.querySelector('img')).toBeNull();
    expect(getByLabelText('Test photo — image unavailable')).not.toBeNull();
  });

  it('still opens (invokes onClick) once the image is broken — the full-size media may load fine', () => {
    const onClick = vi.fn();
    const { container } = wrap(
      <BaseCard imageUrl="https://cdn.example.com/missing.jpg" resourceType="image" onClick={onClick} />,
    );
    const card = container.querySelector('[data-media-card-aspect="tall"]')!;

    fireEvent.error(container.querySelector('img')!);
    fireEvent.click(card);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(card.getAttribute('data-media-unavailable')).toBe('true');
  });

  it('keeps overlays/actions visible on a broken image — BaseCard only reports failure, callers decide what to hide', () => {
    const { container, getByText } = wrap(
      <BaseCard
        imageUrl="https://cdn.example.com/missing.jpg"
        resourceType="image"
        overlays={<span>Price</span>}
        actions={<button type="button">Retry</button>}
      />,
    );

    fireEvent.error(container.querySelector('img')!);

    expect(getByText('Price')).not.toBeNull();
    expect(getByText('Retry')).not.toBeNull();
  });

  it('reports load failure via onBrokenChange, without calling it on a successful mount', () => {
    const onBrokenChange = vi.fn();
    const { container } = wrap(
      <BaseCard
        imageUrl="https://cdn.example.com/missing.jpg"
        resourceType="image"
        onBrokenChange={onBrokenChange}
      />,
    );

    expect(onBrokenChange).not.toHaveBeenCalled();

    fireEvent.error(container.querySelector('img')!);

    expect(onBrokenChange).toHaveBeenCalledWith(true);
  });

  it('marks media cards as tall gallery items', () => {
    const { container } = wrap(
      <BaseCard imageUrl="https://cdn.example.com/photo.jpg" resourceType="image" />,
    );

    expect(container.querySelector('[data-media-card-aspect="tall"]')).not.toBeNull();
  });

  it('marks card actions for glass styling', () => {
    const { container } = wrap(
      <BaseCard
        imageUrl="https://cdn.example.com/photo.jpg"
        resourceType="image"
        actions={<button type="button">Save</button>}
      />,
    );

    expect(container.querySelector('[data-gallery-card-actions="glass"]')).not.toBeNull();
  });

  it('opens an action-free clickable card once from Enter or Space while ignoring unrelated keys', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { getByRole } = wrap(
      <BaseCard
        imageUrl="https://cdn.example.com/photo.jpg"
        resourceType="image"
        alt="Test photo"
        onClick={onClick}
      />,
    );
    const card = getByRole('button', { name: 'Open Test photo' });

    expect(card.tagName).toBe('BUTTON');

    card.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);

    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);

    await user.keyboard('{ArrowRight}');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('keeps the preview and nested action as sibling buttons with independent keyboard behavior', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { getByRole } = wrap(
      <BaseCard
        imageUrl="https://cdn.example.com/photo.jpg"
        resourceType="image"
        alt="Test photo"
        onClick={onClick}
        actions={<button type="button">Save</button>}
      />,
    );
    const preview = getByRole('button', { name: 'Open Test photo' });
    const nestedAction = getByRole('button', { name: 'Save' });

    expect(preview.contains(nestedAction)).toBe(false);

    nestedAction.focus();
    await user.keyboard('{Enter}');

    expect(onClick).not.toHaveBeenCalled();

    preview.focus();
    await user.keyboard('{Enter}');

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps a card without onClick out of the button role and tab order', () => {
    const { container } = wrap(
      <BaseCard imageUrl="https://cdn.example.com/photo.jpg" resourceType="image" />,
    );
    const card = container.querySelector('[data-media-card-aspect="tall"]');

    expect(card?.getAttribute('role')).toBeNull();
    expect(card?.getAttribute('tabindex')).toBeNull();
  });
});

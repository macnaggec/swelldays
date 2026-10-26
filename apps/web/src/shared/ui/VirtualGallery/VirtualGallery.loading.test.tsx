import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { BaseCard } from 'shared/ui/BaseGallery';
import { VirtualGallery } from './VirtualGallery';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    scrollOffset: 0,
    scrollRect: { width: 390, height: 440 },
    getVirtualItems: () => [0, 1, 2].map((index) => ({ key: index, index, start: index * 220, size: 220 })),
    getTotalSize: () => 2200,
    scrollToIndex: vi.fn(),
    resizeItem: vi.fn(),
    measureElement: () => 0,
  }),
}));

describe('virtual gallery image delivery', () => {
  it('requests only mounted thumbnails and gives overscan rows lazy priority', () => {
    const { container } = render(<VirtualGallery
      rows={Array.from({ length: 10 }, (_, index) => ({ type: 'media', key: `row-${index}`, items: [{ id: String(index) }] }))}
      renderCard={(item, context) => <BaseCard imageUrl={`/thumbnail-${item.id}.jpg`} resourceType="image" imageLoading={context.imageLoading} />}
    />);
    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(3);
    expect(images[0]).toHaveAttribute('loading', 'eager');
    expect(images[1]).toHaveAttribute('loading', 'eager');
    expect(images[2]).toHaveAttribute('loading', 'lazy');
    expect([...images].map((image) => image.getAttribute('src'))).toEqual(['/thumbnail-0.jpg', '/thumbnail-1.jpg', '/thumbnail-2.jpg']);
    expect(container.querySelector('video')).toBeNull();
  });
});

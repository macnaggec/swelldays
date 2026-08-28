import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { ScopeSwitcher } from './ScopeSwitcher';

describe('ScopeSwitcher', () => {
  it('reports pointer, touch, and keyboard intent before changing scope', () => {
    const onIntent = vi.fn();
    const onChange = vi.fn();
    render(
      <ScopeSwitcher
        scope="sessions"
        onChange={onChange}
        onIntent={onIntent}
      />,
    );

    const gallery = screen.getByRole('button', { name: 'Gallery' });
    fireEvent.pointerEnter(gallery);
    fireEvent.pointerDown(gallery, { pointerType: 'touch' });
    fireEvent.touchStart(gallery);
    fireEvent.focus(gallery);

    expect(onIntent).toHaveBeenNthCalledWith(1, 'gallery');
    expect(onIntent).toHaveBeenNthCalledWith(2, 'gallery');
    expect(onIntent).toHaveBeenNthCalledWith(3, 'gallery');
    expect(onIntent).toHaveBeenNthCalledWith(4, 'gallery');
    expect(onChange).not.toHaveBeenCalled();
  });
});

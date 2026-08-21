import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it, vi } from 'vitest';
import type { GalleryCard } from '../../model';
import { UploadStatusLabel } from './UploadStatusLabel';

function renderLabel(items: GalleryCard[]) {
  return render(
    <MantineProvider>
      <UploadStatusLabel items={items} hasActiveUploads onOpen={vi.fn()} />
    </MantineProvider>,
  );
}

describe('UploadStatusLabel', () => {
  it('uses queue policy active counts for importing cards', () => {
    const items = [
      {
        kind: 'attempt',
        id: 'import-1',
        source: 'DRIVE' as const,
        status: 'ACQUIRING' as const,
        previewUrl: 'drive:import-1',
        resourceType: 'image' as const,
      },
    ] satisfies GalleryCard[];

    renderLabel(items);

    expect(screen.getByText('1 uploading')).not.toBeNull();
  });
});

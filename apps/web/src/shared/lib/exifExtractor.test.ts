import { describe, expect, it, vi } from 'vitest';
import exifr from 'exifr';
import { extractExifData } from './exifExtractor';

vi.mock('exifr', () => ({
  default: { parse: vi.fn() },
}));

describe('extractExifData', () => {
  it('reads capturedAt as the camera-local wall clock, ignoring OffsetTimeOriginal', async () => {
    // exifr always parses DateTimeOriginal as a naive browser-local Date — it never
    // applies OffsetTimeOriginal itself (see exifr's reviveDate tag reviver), so an
    // offset tag must not shift the hour we read back out.
    vi.mocked(exifr.parse).mockResolvedValue({
      DateTimeOriginal: new Date(2022, 11, 31, 8, 1, 0),
      OffsetTimeOriginal: '+05:00',
    });

    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
    const { capturedAt } = await extractExifData(file);

    expect(capturedAt?.getUTCFullYear()).toBe(2022);
    expect(capturedAt?.getUTCMonth()).toBe(11);
    expect(capturedAt?.getUTCDate()).toBe(31);
    expect(capturedAt?.getUTCHours()).toBe(8);
    expect(capturedAt?.getUTCMinutes()).toBe(1);
  });

  it('reads capturedAt correctly when there is no offset tag at all', async () => {
    vi.mocked(exifr.parse).mockResolvedValue({
      DateTimeOriginal: new Date(2022, 11, 31, 8, 1, 0),
    });

    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
    const { capturedAt } = await extractExifData(file);

    expect(capturedAt?.getUTCHours()).toBe(8);
    expect(capturedAt?.getUTCMinutes()).toBe(1);
  });

  it('falls back to file.lastModified, normalized to the same UTC-labelled convention as EXIF dates', async () => {
    // The fallback Date is a real instant, not a naive local one — without this
    // normalization its UTC hour would silently drift from what the uploader's
    // own OS shows for the file, by exactly their timezone offset.
    vi.mocked(exifr.parse).mockResolvedValue({});

    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
    const { capturedAt, source } = await extractExifData(file);
    const localLastModified = new Date(file.lastModified);

    expect(source).toBe('fallback');
    expect(capturedAt?.getUTCFullYear()).toBe(localLastModified.getFullYear());
    expect(capturedAt?.getUTCMonth()).toBe(localLastModified.getMonth());
    expect(capturedAt?.getUTCDate()).toBe(localLastModified.getDate());
    expect(capturedAt?.getUTCHours()).toBe(localLastModified.getHours());
    expect(capturedAt?.getUTCMinutes()).toBe(localLastModified.getMinutes());
  });
});

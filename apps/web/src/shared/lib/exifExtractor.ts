import exifr from 'exifr';
import { browserLogger } from './browserLogger';

export interface ExifData {
  capturedAt: Date | null;
  source: 'exif' | 'fallback';
  latitude?: number;
  longitude?: number;
  camera?: string;
  lens?: string;
}

/**
 * capturedAt's UTC-labelled fields hold the camera's local wall-clock time (see
 * getCapturedMediaCalendarDayKey) — every capturedAt in the app follows this
 * convention, so this re-expresses ANY local Date (an EXIF DateTimeOriginal, or
 * the file.lastModified fallback) the same way, regardless of the uploader's
 * own timezone. Without it, a fallback value's real UTC instant would read as a
 * different hour/day than what the uploader's OS shows for that file.
 *
 * EXIF DateTimeOriginal is a naive string — no timezone. exifr's own tag reviver
 * (reviveDate) always parses it as a browser-local Date via `new Date(y, m, d)` +
 * setHours/setMinutes/setSeconds — it never reads OffsetTimeOriginal itself, so
 * there is no "exifr already applied the offset" case to undo.
 */
function toCameraLocalAsUTC(d: Date): Date {
  return new Date(Date.UTC(
    d.getFullYear(), d.getMonth(), d.getDate(),
    d.getHours(), d.getMinutes(), d.getSeconds(),
  ));
}

export async function extractExifData(file: File): Promise<ExifData> {
  try {
    if (!file.type.startsWith('image/')) {
      return { capturedAt: toCameraLocalAsUTC(new Date(file.lastModified)), source: 'fallback' };
    }

    const exif = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      pick: [
        'DateTimeOriginal',
        'CreateDate',
        'ModifyDate',
        'GPSLatitude',
        'GPSLongitude',
        'Make',
        'Model',
        'LensModel',
      ],
    });

    if (!exif) {
      return { capturedAt: toCameraLocalAsUTC(new Date(file.lastModified)), source: 'fallback' };
    }

    const rawDate: Date | undefined =
      exif.DateTimeOriginal ?? exif.CreateDate ?? exif.ModifyDate;

    const capturedAt = toCameraLocalAsUTC(rawDate ?? new Date(file.lastModified));

    const source = exif.DateTimeOriginal ?? exif.CreateDate ? 'exif' : 'fallback';

    const camera =
      exif.Make && exif.Model ? `${exif.Make} ${exif.Model}`.trim() : undefined;

    return {
      capturedAt,
      source,
      latitude: exif.GPSLatitude,
      longitude: exif.GPSLongitude,
      camera,
      lens: exif.LensModel,
    };
  } catch (error) {
    browserLogger.warn('EXIF extraction failed', {
      error,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    });
    return { capturedAt: toCameraLocalAsUTC(new Date(file.lastModified)), source: 'fallback' };
  }
}

export async function extractExifDataBatch(files: File[]): Promise<Map<File, ExifData>> {
  const results = await Promise.all(
    files.map(async (file) => [file, await extractExifData(file)] as const),
  );
  return new Map(results);
}

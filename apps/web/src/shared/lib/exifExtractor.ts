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
 * EXIF DateTimeOriginal is a naive string — no timezone.
 * exifr parses it using the browser's local timezone, which corrupts the camera hour
 * when sending over the network (UTC serialization bakes in the uploader's offset).
 *
 * This function normalises the Date so that getUTCHours() == camera hour:
 *
 * - No offset tag: exifr returned a browser-local Date; extract its local components
 *   and re-express as UTC.
 * - OffsetTimeOriginal present (smartphones): exifr produced a proper UTC Date;
 *   add the offset back to recover camera local time, store that as UTC.
 */
function toCameraLocalAsUTC(d: Date, offsetStr: string | undefined): Date {
  if (!offsetStr) {
    // Naive datetime — browser local = camera local
    return new Date(Date.UTC(
      d.getFullYear(), d.getMonth(), d.getDate(),
      d.getHours(), d.getMinutes(), d.getSeconds(),
    ));
  }

  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offsetStr);
  if (!m) {
    return new Date(Date.UTC(
      d.getFullYear(), d.getMonth(), d.getDate(),
      d.getHours(), d.getMinutes(), d.getSeconds(),
    ));
  }

  // exifr already applied the offset → d is true UTC; camera local = UTC + offset
  const sign = m[1] === '+' ? 1 : -1;
  const offsetMs = sign * (parseInt(m[2]!) * 60 + parseInt(m[3]!)) * 60_000;
  return new Date(d.getTime() + offsetMs);
}

export async function extractExifData(file: File): Promise<ExifData> {
  try {
    if (!file.type.startsWith('image/')) {
      return { capturedAt: new Date(file.lastModified), source: 'fallback' };
    }

    const exif = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      pick: [
        'DateTimeOriginal',
        'CreateDate',
        'ModifyDate',
        'OffsetTimeOriginal',
        'OffsetTimeDigitized',
        'GPSLatitude',
        'GPSLongitude',
        'Make',
        'Model',
        'LensModel',
      ],
    });

    if (!exif) {
      return { capturedAt: new Date(file.lastModified), source: 'fallback' };
    }

    const rawDate: Date | undefined =
      exif.DateTimeOriginal ?? exif.CreateDate ?? exif.ModifyDate;

    const offsetStr: string | undefined =
      exif.OffsetTimeOriginal ?? exif.OffsetTimeDigitized;

    const capturedAt = rawDate
      ? toCameraLocalAsUTC(rawDate, offsetStr)
      : new Date(file.lastModified);

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
    return { capturedAt: new Date(file.lastModified), source: 'fallback' };
  }
}

export async function extractExifDataBatch(files: File[]): Promise<Map<File, ExifData>> {
  const results = await Promise.all(
    files.map(async (file) => [file, await extractExifData(file)] as const),
  );
  return new Map(results);
}

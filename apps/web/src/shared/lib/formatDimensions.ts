/**
 * Formats original media pixel dimensions for display, e.g. `1920 × 1080`.
 * Returns null when either dimension is missing (rows uploaded before capture existed).
 */
export function formatDimensions(width?: number | null, height?: number | null): string | null {
  if (!width || !height) return null;
  return `${width} × ${height}`;
}

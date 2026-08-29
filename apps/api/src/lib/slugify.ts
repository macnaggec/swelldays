/** Lowercase, hyphen-joined, URL-safe form of a name — e.g. "Bali Soul" -> "bali-soul". */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

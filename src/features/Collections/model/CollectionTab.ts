export const COLLECTION_TABS = ['uploads', 'purchases', 'favorites'] as const;

export type CollectionTab = (typeof COLLECTION_TABS)[number];

export function isCollectionTab(value: string): value is CollectionTab {
  return (COLLECTION_TABS as readonly string[]).includes(value);
}

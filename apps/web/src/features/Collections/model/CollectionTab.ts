export const COLLECTION_TABS = ['uploads', 'purchases', 'favorites'] as const;

export type CollectionTab = (typeof COLLECTION_TABS)[number];

export function isCollectionTab(value: string): value is CollectionTab {
  return (COLLECTION_TABS as readonly string[]).includes(value);
}

// Shared with _panel.tsx, which derives the desktop header switcher's active
// tab from the URL the same way the route itself does.
export const COLLECTION_TAB_ROUTES: Record<CollectionTab, string> = {
  uploads: '/me/collections',
  purchases: '/me/collections/purchases',
  favorites: '/me/collections/favorites',
};

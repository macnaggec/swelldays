import type { GalleryCard } from './types';

function isActiveAttempt(card: GalleryCard): boolean {
  return card.kind === 'attempt'
    && ['pending', 'READY', 'ACQUIRING', 'FINALIZING'].includes(card.status);
}

export function getSelectableUploadCards(cards: GalleryCard[]): GalleryCard[] {
  return cards.filter(card => card.kind !== 'attempt');
}

export function getPublishableMediaIds(cards: GalleryCard[]): string[] {
  return cards.filter(c => c.kind !== 'attempt').map(c => c.id);
}

export function getUploadQueueStatus(cards: GalleryCard[]) {
  const readyItems = getSelectableUploadCards(cards);
  const errorCards = cards.filter(card => card.kind === 'attempt' && card.status === 'FAILED');
  const hasActiveUploads = cards.some(isActiveAttempt);
  const uploadingCount = cards.filter(isActiveAttempt).length;

  return {
    readyItems,
    errorCards,
    hasActiveUploads,
    uploadingCount,
    canContinue: !hasActiveUploads && readyItems.length > 0 && errorCards.length === 0,
  };
}

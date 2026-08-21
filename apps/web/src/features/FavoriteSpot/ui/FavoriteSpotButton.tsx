import { ActionIcon } from '@mantine/core';
import { IconHeart } from '@tabler/icons-react';
import { useFavoriteSpot } from 'entities/Spot';

export interface FavoriteSpotButtonProps {
  spotId: string;
}

export function FavoriteSpotButton({ spotId }: FavoriteSpotButtonProps) {
  const { isFavorited, toggleFavorite, isPending } = useFavoriteSpot(spotId);

  return (
    <ActionIcon
      variant={isFavorited ? 'filled' : 'subtle'}
      color="red"
      size="md"
      radius="xl"
      aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      loading={isPending}
      onClick={(e) => {
        e.stopPropagation();
        toggleFavorite();
      }}
    >
      <IconHeart size={16} fill={isFavorited ? 'currentColor' : 'none'} />
    </ActionIcon>
  );
}

import { useParams } from '@tanstack/react-router';
import { useSpotPreviewBySlug } from './useSpotPreviewBySlug';

/** Single definition of "selected spot": whatever $spotId (a slug) is in the active route. */
export function useSelectedSpot() {
  const { spotId = null } = useParams({ strict: false });
  const { data: spot } = useSpotPreviewBySlug(spotId ?? '', { enabled: !!spotId });
  return { spotId, spot: spotId ? spot : null };
}

import { useParams } from '@tanstack/react-router';
import { useSpotPreview } from './useSpotPreview';

/** Single definition of "selected spot": whatever $spotId is in the active route. */
export function useSelectedSpot() {
  const { spotId = null } = useParams({ strict: false });
  const { data: spot } = useSpotPreview(spotId ?? '', { enabled: !!spotId });
  return { spotId, spot: spotId ? spot : null };
}

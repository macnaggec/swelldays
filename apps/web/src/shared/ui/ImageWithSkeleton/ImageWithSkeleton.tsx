import { Box, Image, Skeleton } from '@mantine/core';
import { useState } from 'react';

interface ImageWithSkeletonProps {
  src: string;
  alt: string;
  fit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  mah?: string | number;
  skeletonHeight?: string | number;
  radius?: string | number;
}

/**
 * Image that shows a Skeleton placeholder while the src is loading.
 *
 * Use `key={src}` at the call site to reset loading state when src changes.
 * Without it, the skeleton won't re-appear on subsequent image changes.
 */
export function ImageWithSkeleton({
  src,
  alt,
  fit = 'contain',
  mah,
  skeletonHeight = '60vh',
  radius = 'md',
}: ImageWithSkeletonProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <Box>
      {!loaded && <Skeleton height={skeletonHeight} radius={radius} />}
      <Image
        src={src}
        fit={fit}
        mah={mah}
        style={{ display: loaded ? 'block' : 'none' }}
        onLoad={() => setLoaded(true)}
        alt={alt}
      />
    </Box>
  );
}

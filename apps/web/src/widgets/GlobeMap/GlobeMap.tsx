import { lazy, Suspense } from 'react';
import { Loader } from '@mantine/core';
import type { GlobeMapProps, GlobeMapHandle } from './GlobeMapComponent';
import classes from './GlobeMap.module.css';

const GlobeMapLazy = lazy(() =>
  import('./GlobeMapComponent').then((mod) => ({ default: mod.GlobeMapComponent }))
);

export function GlobeMap(props: GlobeMapProps) {
  return (
    <Suspense
      fallback={
        <div className={classes.globeContainer}>
          <div className={classes.loading}>
            <Loader color="blue" size="lg" />
          </div>
        </div>
      }
    >
      <GlobeMapLazy {...props} />
    </Suspense>
  );
}

export type { GlobeMapProps, GlobeMapHandle };
export type { MapSpotProjection } from './model/mapSpotProjection';

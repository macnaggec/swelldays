import { lazy, Suspense } from 'react';
import type { ComponentProps } from 'react';
import classes from './Video.module.css';

const LazyVideo = lazy(() => import('./Video'));

/**
 * Lazy-loaded Video component
 * HLS.js (~240KB) is only loaded when a video is rendered
 */
export const Video = (props: ComponentProps<typeof LazyVideo>) => (
  <Suspense
    fallback={
      <div className={classes.fallback}>
        Loading video...
      </div>
    }
  >
    <LazyVideo {...props} />
  </Suspense>
);

export default Video;

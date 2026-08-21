import { useEffect, useRef } from 'react';
import classes from './Video.module.css';
import Hls from 'hls.js';

const Video = ({
  playbackUrl,
  controls,
}: {
  playbackUrl: string,
  controls: boolean,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(playbackUrl);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // For Safari
      video.src = playbackUrl;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playbackUrl]);

  return (
    <video
      ref={videoRef}
      controls={controls}
      width="100%"
      height="auto"
      className={classes.video}
    />
  );
};

export default Video;

'use client';

import type { RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { steppedTime } from './videoTime';

export interface VideoLoop {
  end: number;
  start: number;
}

const RATE_STORAGE_KEY = 'acceptance-video-rate';

const readStoredRate = () => {
  try {
    const value = Number(localStorage.getItem(RATE_STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : 1;
  } catch {
    return 1;
  }
};

/**
 * The state of one `<video>`, frame-accurate while playing.
 *
 * `timeupdate` fires a few times a second, which is too coarse to put a region
 * on the frame it was drawn on; `requestVideoFrameCallback` reports every
 * painted frame, with `requestAnimationFrame` as the fallback. The chosen
 * playback rate is remembered across videos: a reviewer who watches at 1.5×
 * wants the next recording at 1.5× too.
 */
export const useVideoClock = (
  videoRef: RefObject<HTMLVideoElement | null>,
  { loop, src }: { loop?: VideoLoop | null; src: string },
) => {
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);
  const [rate, setRateState] = useState(1);
  const [size, setSize] = useState<{ height: number; width: number } | null>(null);
  const [status, setStatus] = useState<'error' | 'loading' | 'ready'>('loading');
  const loopRef = useRef(loop);
  loopRef.current = loop;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setStatus('loading');
    video.playbackRate = readStoredRate();

    let handle = 0;
    const schedule = () => {
      handle = video.requestVideoFrameCallback
        ? video.requestVideoFrameCallback(tick)
        : requestAnimationFrame(tick);
    };
    const tick = () => {
      const span = loopRef.current;
      if (span && !video.paused && video.currentTime >= span.end) video.currentTime = span.start;
      setTime(video.currentTime);
      schedule();
    };
    const onMeta = () => {
      setDuration(video.duration);
      setSize({ height: video.videoHeight, width: video.videoWidth });
      setStatus('ready');
    };
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    const onSeeked = () => setTime(video.currentTime);
    const onRate = () => setRateState(video.playbackRate);
    const onError = () => setStatus('error');

    if (video.readyState >= 1) onMeta();
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('ratechange', onRate);
    video.addEventListener('error', onError);
    schedule();

    return () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('ratechange', onRate);
      video.removeEventListener('error', onError);
      if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
    };
  }, [videoRef, src]);

  const controls = useMemo(
    () => ({
      pause: () => videoRef.current?.pause(),
      reload: () => {
        setStatus('loading');
        videoRef.current?.load();
      },
      seek: (seconds: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = Math.min(Math.max(seconds, 0), video.duration || 0);
        setTime(video.currentTime);
      },
      setRate: (value: number) => {
        if (videoRef.current) videoRef.current.playbackRate = value;
        try {
          localStorage.setItem(RATE_STORAGE_KEY, String(value));
        } catch {
          /* private mode — the rate simply resets next time */
        }
      },
      step: (frames: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.pause();
        video.currentTime = steppedTime(video.currentTime, frames, video.duration || 0);
      },
      toggle: () => {
        const video = videoRef.current;
        if (!video) return;
        if (!video.paused) return video.pause();
        const span = loopRef.current;
        if (video.ended || (span && video.currentTime >= span.end))
          video.currentTime = span?.start ?? 0;
        void video.play();
      },
    }),
    [videoRef],
  );

  return { controls, duration, paused, rate, size, status, time };
};

export type VideoClock = ReturnType<typeof useVideoClock>;

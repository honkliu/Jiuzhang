import React, { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';

const BoxAny = Box as any;
const PLAY_EVENT_NAME = 'kankan-voice-bubble-play';

interface VoiceMessageBubbleProps {
  url: string;
  duration?: number;
  align: 'left' | 'right';
  isMobile: boolean;
}

const formatVoiceBubbleDuration = (duration?: number) => {
  if (!duration || duration <= 0) return '1"';
  return `${Math.max(1, Math.round(duration))}"`;
};

export const VoiceMessageBubble: React.FC<VoiceMessageBubbleProps> = ({ url, duration, align, isMobile }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [actualDuration, setActualDuration] = useState(duration || 0);
  const bubbleDuration = actualDuration > 0 ? actualDuration : duration || 0;
  const bubbleWidth = Math.min(isMobile ? 180 : 240, Math.max(80, 80 + bubbleDuration * 4));

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setActualDuration(audio.duration);
      }
    };
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };
    const handleExternalPlay = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      if (customEvent.detail !== url) {
        audio.pause();
        audio.currentTime = 0;
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    window.addEventListener(PLAY_EVENT_NAME, handleExternalPlay as EventListener);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      window.removeEventListener(PLAY_EVENT_NAME, handleExternalPlay as EventListener);
    };
  }, [url]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      return;
    }

    window.dispatchEvent(new CustomEvent(PLAY_EVENT_NAME, { detail: url }));
    if (audio.currentTime >= (bubbleDuration || 0) && bubbleDuration > 0) {
      audio.currentTime = 0;
    }

    try {
      await audio.play();
    } catch {
      setIsPlaying(false);
    }
  };

  return (
    <BoxAny
      component="button"
      type="button"
      onClick={togglePlayback}
      sx={{
        display: 'flex',
        flexDirection: align === 'right' ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: '6px',
        flexShrink: 0,
        width: bubbleWidth,
        maxWidth: '100%',
        px: 0,
        py: 0,
        border: 'none',
        bgcolor: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        appearance: 'none',
        WebkitAppearance: 'none',
      }}
    >
      {/* WeChat-style voice icon: filled small sector + 2 stroked arcs */}
      <BoxAny
        component="svg"
        viewBox="0 0 14 14"
        sx={{
          width: 18,
          height: 18,
          flexShrink: 0,
          transform: align === 'right' ? 'scaleX(-1)' : 'none',
          overflow: 'visible',
          opacity: 0.87,
        }}
      >
        <style>{`
          @keyframes vcArc1 { 0%,100%{opacity:0.35} 50%{opacity:1} }
          @keyframes vcArc2 { 0%,100%{opacity:0.2} 50%{opacity:1} }
        `}</style>

        {/* Scale whole icon to ~2/5 of box height, centered at origin (1,7) */}
        <g transform="translate(1,7) scale(0.69) translate(-1,-7)">
          {/* Innermost: small filled sector (扇形), center (1,7), r=3 */}
          <path
            d="M 1 7 L 3.46 5.28 A 3 3 0 0 1 3.46 8.72 Z"
            fill="currentColor"
            style={{ opacity: 1 }}
          />

          {/* Middle arc: center (1,7), r=6.5, ±40° */}
          <path
            d="M 5.98 2.82 A 6.5 6.5 0 0 1 5.98 11.18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            style={{
              opacity: 1,
              animation: isPlaying ? 'vcArc1 1s ease-in-out infinite' : 'none',
            }}
          />

          {/* Outer arc: center (1,7), r=10, ±42° */}
          <path
            d="M 8.43 0.31 A 10 10 0 0 1 8.43 13.69"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            style={{
              opacity: 1,
              animation: isPlaying ? 'vcArc2 1s 0.2s ease-in-out infinite' : 'none',
            }}
          />
        </g>
      </BoxAny>

      {/* Duration */}
      <BoxAny
        component="span"
        sx={{
          flexShrink: 0,
          fontSize: '0.8rem',
          lineHeight: 1,
          opacity: 0.9,
        }}
      >
        {formatVoiceBubbleDuration(bubbleDuration)}
      </BoxAny>

      <BoxAny component="audio" ref={audioRef} src={url} preload="metadata" sx={{ display: 'none' }} />
    </BoxAny>
  );
};
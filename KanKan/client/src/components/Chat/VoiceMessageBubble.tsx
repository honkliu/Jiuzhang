import React, { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { PauseRounded, PlayArrowRounded } from '@mui/icons-material';

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
  const bubbleWidth = Math.min(isMobile ? 220 : 290, Math.max(isMobile ? 118 : 148, (isMobile ? 110 : 138) + bubbleDuration * 3));
  const bubbleHeight = isMobile ? 32 : 34;
  const progressRatio = bubbleDuration > 0 ? Math.min(1, currentTime / bubbleDuration) : 0;

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
        position: 'relative',
        display: 'flex',
        flexDirection: align === 'right' ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: 0.75,
        alignSelf: align === 'right' ? 'flex-end' : 'flex-start',
        width: bubbleWidth,
        height: bubbleHeight,
        maxWidth: '100%',
        px: isMobile ? 0.9 : 1,
        py: 0,
        border: '1px solid rgba(120, 94, 62, 0.35)',
        borderRadius: '999px',
        bgcolor: align === 'right' ? 'rgba(222, 247, 226, 0.9)' : 'rgba(255, 248, 238, 0.92)',
        color: align === 'right' ? 'rgba(22, 74, 45, 0.95)' : 'rgba(78, 50, 23, 0.95)',
        boxShadow: isPlaying ? '0 10px 24px rgba(46, 30, 16, 0.18)' : '0 6px 18px rgba(46, 30, 16, 0.12)',
        overflow: 'hidden',
        cursor: 'pointer',
        textAlign: 'left',
        appearance: 'none',
        WebkitAppearance: 'none',
        transition: 'transform 160ms ease, box-shadow 160ms ease',
        '&:hover': {
          transform: 'translateY(-1px)',
          boxShadow: '0 12px 28px rgba(46, 30, 16, 0.18)',
        },
        '&:active': {
          transform: 'translateY(0)',
        },
        '&:focus-visible': {
          outline: '2px solid rgba(40, 122, 88, 0.55)',
          outlineOffset: 2,
        },
      }}
    >
      <BoxAny
        sx={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: align === 'right' ? 'auto' : 0,
          right: align === 'right' ? 0 : 'auto',
          width: `${progressRatio * 100}%`,
          bgcolor: align === 'right' ? 'rgba(76, 175, 80, 0.16)' : 'rgba(210, 164, 110, 0.18)',
          transition: isPlaying ? 'width 120ms linear' : 'width 180ms ease',
          pointerEvents: 'none',
        }}
      />

      <BoxAny
        sx={{
          position: 'relative',
          zIndex: 1,
          width: isMobile ? 20 : 22,
          height: isMobile ? 20 : 22,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: align === 'right' ? 'rgba(35, 124, 69, 0.14)' : 'rgba(120, 82, 48, 0.12)',
          flexShrink: 0,
        }}
      >
        {isPlaying ? <PauseRounded sx={{ fontSize: isMobile ? 13 : 14 }} /> : <PlayArrowRounded sx={{ fontSize: isMobile ? 15 : 16 }} />}
      </BoxAny>

      <BoxAny
        sx={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: align === 'right' ? 'flex-start' : 'flex-end',
          gap: 0.3,
          minWidth: 0,
        }}
      >
        {Array.from({ length: 7 }).map((_, index) => {
          const heights = isMobile ? [4, 6, 8, 10, 8, 6, 4] : [5, 7, 9, 11, 9, 7, 5];
          return (
            <BoxAny
              key={`${url}-bar-${index}`}
              sx={{
                width: 2,
                height: heights[index],
                borderRadius: '999px',
                bgcolor: 'currentColor',
                opacity: isPlaying ? 0.95 : 0.35 + index * 0.06,
                transformOrigin: 'center',
                animation: isPlaying ? `voiceBubblePulse 900ms ${index * 90}ms ease-in-out infinite` : 'none',
                '@keyframes voiceBubblePulse': {
                  '0%, 100%': { transform: 'scaleY(0.45)' },
                  '50%': { transform: 'scaleY(1)' },
                },
              }}
            />
          );
        })}
      </BoxAny>

      <BoxAny
        component="span"
        sx={{
          position: 'relative',
          zIndex: 1,
          flexShrink: 0,
          minWidth: 22,
          fontSize: isMobile ? '0.68rem' : '0.72rem',
          fontWeight: 600,
          opacity: 0.9,
        }}
      >
        {formatVoiceBubbleDuration(bubbleDuration)}
      </BoxAny>

      <BoxAny component="audio" ref={audioRef} src={url} preload="metadata" sx={{ display: 'none' }} />
    </BoxAny>
  );
};
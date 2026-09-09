import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import { Close as CloseIcon, History as HistoryIcon } from '@mui/icons-material';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, Html } from '@react-three/drei';
import { SkeletonUtils, type OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';

import { useLanguage } from '@/i18n/LanguageContext';
import type { Chat, Message, Participant } from '@/services/chat.service';
import type { User } from '@/types';
import { ChatMessageContent, MessageBubble } from './MessageBubble';

const BoxAny = Box as any;

export interface ChatRoom3DProps {
  chat: Chat;
  me: User | null;
  messages: Message[];
  typingUsers: { userId: string; userName: string }[];
  hasOlderMessages: boolean;
  onLoadOlderMessages: () => Promise<boolean>;
}

type Gesture = 'idle' | 'speaking' | 'agree' | 'question' | 'happy' | 'excited' | 'sad' | 'thinking';
type Position = [number, number, number];

interface RoomPerson {
  userId: string;
  displayName: string;
}

const ROOM_MODEL_URL = '/models/room/newroom.glb';
const GIRL_ON_COUCH_URL = '/models/avatars/girl_on_couch_but_no_couch.glb';
const BEAUTY_GIRL_URL = '/models/avatars/sit_the_beauty_girl.glb';

const getMessagePreview = (message?: Message) => {
  if (!message) return '';
  const text = message.text?.trim();
  if (text) return text;
  if (message.messageType === 'image') return '[Photo]';
  if (message.messageType === 'voice') return '[Voice message]';
  if (message.messageType === 'video') return '[Video]';
  if (message.messageType === 'file') return message.fileName ? `[File] ${message.fileName}` : '[File]';
  return '';
};

const getGesture = (message?: Message): Gesture => {
  const text = getMessagePreview(message).toLowerCase();
  if (!text) return 'idle';
  if (/[?？]|为什么|怎么|what|why|how/.test(text)) return 'question';
  if (/哈哈|开心|高兴|太好了|\b(lol|haha)\b|[😄😁😂😊]/.test(text)) return 'happy';
  if (/太棒|厉害|惊喜|wow|amazing|great|[!！]{2,}|[🤩🎉]/.test(text)) return 'excited';
  if (/难过|伤心|遗憾|抱歉|sad|sorry|[😢😭]/.test(text)) return 'sad';
  if (/好的|可以|同意|没问题|\b(ok|yes|agree|sure)\b|[👍👌]/.test(text)) return 'agree';
  return 'speaking';
};

const fitToHeight = (model: THREE.Object3D, targetHeight: number) => {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y <= 0) return;
  const scale = targetHeight / size.y;
  model.scale.setScalar(scale);
};

const placeOnFloor = (model: THREE.Object3D) => {
  const box = new THREE.Box3().setFromObject(model);
  const minY = box.min.y;
  model.position.y -= minY;
};

const LoadingOverlay: React.FC = () => (
  <Html center>
    <BoxAny
      sx={{
        p: '8px 10px',
        bgcolor: 'rgba(0,0,0,0.55)',
        color: '#fff',
        fontFamily: '"Noto Sans SC", "PingFang SC", "Source Han Sans SC", sans-serif',
        fontSize: 12,
        borderRadius: 1,
      }}
    >
      Loading room...
    </BoxAny>
  </Html>
);

const SpeechBubble: React.FC<{
  person: RoomPerson;
  message?: Message;
  isTyping: boolean;
  accent: string;
  mentionableNames: string[];
}> = ({ person, message, isTyping, accent, mentionableNames }) => {
  const preview = isTyping ? '...' : getMessagePreview(message);
  const textRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [isTyping, message?.id]);

  useLayoutEffect(() => {
    if (expanded) return;
    const textElement = textRef.current;
    if (!textElement) return;
    setCanExpand(textElement.scrollHeight > textElement.clientHeight + 1);
  }, [expanded, preview]);

  if (!preview) return null;

  return (
    <BoxAny sx={{
      width: 'min(210px, 38vw)', position: 'relative', px: 1, py: 0.75,
      color: '#17211d', bgcolor: 'rgba(255,255,255,0.96)',
      border: '1px solid rgba(20,32,27,0.2)', borderTop: `2px solid ${accent}`,
      borderRadius: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.22)', pointerEvents: 'none',
    }}>
      <Typography sx={{ mb: 0.25, fontSize: 10, lineHeight: 1.25, fontWeight: 700 }} noWrap>
        {person.displayName}
      </Typography>
      <BoxAny ref={textRef} sx={{
        pr: canExpand ? 1.5 : 0,
        display: expanded ? 'block' : '-webkit-box',
        WebkitBoxOrient: expanded ? undefined : 'vertical',
        WebkitLineClamp: expanded ? undefined : 4,
        overflow: expanded ? 'visible' : 'hidden',
        wordBreak: 'break-word',
      }}>
        <ChatMessageContent text={preview} mentionableNames={mentionableNames} compact />
      </BoxAny>
      {canExpand && (
        <BoxAny
          component="button"
          type="button"
          aria-label={expanded ? 'Collapse message' : 'Expand message'}
          title={expanded ? 'Collapse' : 'Show full message'}
          onPointerDown={(event: React.PointerEvent) => event.stopPropagation()}
          onClick={(event: React.MouseEvent) => {
            event.stopPropagation();
            setExpanded((value) => !value);
          }}
          sx={{
            position: 'absolute', right: 2, bottom: 1,
            width: 20, height: 20, p: 0, border: 0, borderRadius: '2px',
            display: 'grid', placeItems: 'center',
            bgcolor: 'rgba(255,255,255,0.9)', color: accent,
            font: '700 16px/1 sans-serif', cursor: 'pointer', pointerEvents: 'auto',
            '&:hover': { bgcolor: '#fff' },
            '&:focus-visible': { outline: `2px solid ${accent}`, outlineOffset: 1 },
          }}
        >
          {expanded ? '«' : '»'}
        </BoxAny>
      )}
    </BoxAny>
  );
};

const AvatarActor: React.FC<{
  person: RoomPerson;
  modelUrl: string;
  position: Position;
  rotationY: number;
  bubblePosition: Position;
  latestMessage?: Message;
  isTyping: boolean;
  accent: string;
  phase: number;
  mentionableNames: string[];
}> = ({ person, modelUrl, position, rotationY, bubblePosition, latestMessage, isTyping, accent, phase, mentionableNames }) => {
  const gltf = useGLTF(modelUrl);
  const { invalidate } = useThree();
  const actorRef = useRef<THREE.Group | null>(null);
  const activeUntilRef = useRef(0);
  const previousMessageIdRef = useRef(latestMessage?.id);
  const model = useMemo(() => {
    const clone = SkeletonUtils.clone(gltf.scene);
    fitToHeight(clone, 1.6);
    placeOnFloor(clone);
    return clone;
  }, [gltf.scene]);
  const gesture = useMemo(() => getGesture(latestMessage), [latestMessage]);

  useEffect(() => {
    const now = performance.now();
    if (latestMessage?.id && previousMessageIdRef.current !== latestMessage.id) {
      previousMessageIdRef.current = latestMessage.id;
      activeUntilRef.current = now + 4500;
    }

    const renderUntil = isTyping ? Number.POSITIVE_INFINITY : Math.max(now + 700, activeUntilRef.current + 700);
    let frameId = 0;
    let lastRenderAt = 0;
    const tick = (timestamp: number) => {
      if (timestamp - lastRenderAt >= 1000 / 30) {
        lastRenderAt = timestamp;
        invalidate();
      }
      if (isTyping || timestamp < renderUntil) frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [invalidate, isTyping, latestMessage?.id]);

  useFrame(({ clock }, delta) => {
    const actor = actorRef.current;
    if (!actor) return;

    const time = clock.elapsedTime + phase;
    const activeGesture = isTyping ? 'thinking' : performance.now() < activeUntilRef.current ? gesture : 'idle';
    let lift = Math.sin(time * 1.5) * 0.006;
    let lean = 0;
    let tilt = 0;
    let turn = 0;

    if (activeGesture === 'speaking') {
      lean = Math.sin(time * 6.5) * 0.018;
      turn = Math.sin(time * 3.2) * 0.018;
    } else if (activeGesture === 'agree') {
      lean = Math.sin(time * 8) * 0.035;
    } else if (activeGesture === 'question') {
      tilt = 0.055;
      turn = Math.sin(time * 2.5) * 0.012;
    } else if (activeGesture === 'happy') {
      tilt = Math.sin(time * 4) * 0.035;
      lift += Math.abs(Math.sin(time * 4)) * 0.018;
    } else if (activeGesture === 'excited') {
      tilt = Math.sin(time * 6) * 0.045;
      lift += Math.abs(Math.sin(time * 7)) * 0.045;
    } else if (activeGesture === 'sad') {
      lean = 0.045;
      lift -= 0.015;
    } else if (activeGesture === 'thinking') {
      tilt = -0.04;
      turn = Math.sin(time * 2) * 0.01;
    }

    actor.position.y = THREE.MathUtils.damp(actor.position.y, position[1] + lift, 7, delta);
    actor.rotation.x = THREE.MathUtils.damp(actor.rotation.x, lean, 7, delta);
    actor.rotation.y = THREE.MathUtils.damp(actor.rotation.y, rotationY + turn, 7, delta);
    actor.rotation.z = THREE.MathUtils.damp(actor.rotation.z, tilt, 7, delta);
  });

  return <>
    <group ref={actorRef} position={position} rotation={[0, rotationY, 0]}>
      <primitive object={model} />
    </group>
    <Html position={bubblePosition} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
      <SpeechBubble
        person={person}
        message={latestMessage}
        isTyping={isTyping}
        accent={accent}
        mentionableNames={mentionableNames}
      />
    </Html>
  </>;
};

const RoomModels: React.FC<{
  people: RoomPerson[];
  latestBySender: Map<string, Message>;
  typingIds: Set<string>;
}> = ({ people, latestBySender, typingIds }) => {
  const roomGltf = useGLTF(ROOM_MODEL_URL);
  const roomScene = useMemo(() => roomGltf.scene.clone(true), [roomGltf.scene]);
  const mentionableNames = people.map((person) => person.displayName);

  return (
    <>
      <primitive object={roomScene} />
      {people[0] && <AvatarActor
        person={people[0]} modelUrl={GIRL_ON_COUCH_URL} position={[-1.2, 0, 0.8]}
        rotationY={Math.PI / 2} bubblePosition={[-1.9, 2.2, 0.8]}
        latestMessage={latestBySender.get(people[0].userId)} isTyping={typingIds.has(people[0].userId)}
        accent="#2f7d5a" phase={0} mentionableNames={mentionableNames}
      />}
      {people[1] && <AvatarActor
        person={people[1]} modelUrl={BEAUTY_GIRL_URL} position={[1.6, 0, -1.2]}
        rotationY={-Math.PI * 0.15} bubblePosition={[1.6, 1.85, -1.2]}
        latestMessage={latestBySender.get(people[1].userId)} isTyping={typingIds.has(people[1].userId)}
        accent="#b66a4b" phase={Math.PI} mentionableNames={mentionableNames}
      />}
    </>
  );
};

const RoomCamera: React.FC = () => {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    camera.position.set(3.612, 1.9, 2.814);
    controlsRef.current?.target.set(3.271, 1.9, 2.516);
    controlsRef.current?.update();
  }, [camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.05}
      minPolarAngle={Math.PI / 2}
      maxPolarAngle={Math.PI / 2}
    />
  );
};

const buildRoomPeople = (chat: Chat, me: User | null): RoomPerson[] => {
  const participants = chat.participants ?? [];
  const meParticipant = participants.find((participant) => participant.userId === me?.id);
  const otherParticipant = participants.find((participant) => participant.userId !== me?.id);
  const people: Participant[] = [];

  if (otherParticipant) people.push(otherParticipant);
  if (meParticipant) people.push(meParticipant);
  if (!meParticipant && me) {
    people.push({
      userId: me.id,
      displayName: me.displayName,
      avatarUrl: me.avatarUrl,
      gender: me.gender as 'male' | 'female' | undefined,
      isOnline: true,
    });
  }
  for (const participant of participants) {
    if (people.length >= 2) break;
    if (!people.some((person) => person.userId === participant.userId)) people.push(participant);
  }

  return people.slice(0, 2).map((person) => ({
    userId: person.userId,
    displayName: person.displayName,
  }));
};

const MessageHistory: React.FC<{
  messages: Message[];
  meId?: string;
  mentionableNames: string[];
  hasOlderMessages: boolean;
  onLoadOlderMessages: () => Promise<boolean>;
  onClose: () => void;
}> = ({ messages, meId, mentionableNames, hasOlderMessages, onLoadOlderMessages, onClose }) => {
  const { language, t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const restoreScrollRef = useRef<{ height: number; top: number } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const restoreScroll = restoreScrollRef.current;
    if (restoreScroll) {
      restoreScrollRef.current = null;
      container.scrollTop = container.scrollHeight - restoreScroll.height + restoreScroll.top;
    } else {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages.length]);

  const loadOlder = async () => {
    const container = scrollRef.current;
    if (!container || loadingOlder) return;
    restoreScrollRef.current = { height: container.scrollHeight, top: container.scrollTop };
    setLoadingOlder(true);
    try {
      const loaded = await onLoadOlderMessages();
      if (!loaded) restoreScrollRef.current = null;
    } catch (error) {
      restoreScrollRef.current = null;
      console.error('Failed to load older messages:', error);
    } finally {
      setLoadingOlder(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{
      position: 'absolute', zIndex: 40,
      top: { xs: 'auto', sm: 12 }, right: { xs: 8, sm: 12 },
      bottom: { xs: 8, sm: 12 }, left: { xs: 8, sm: 'auto' },
      width: { sm: 360 }, height: { xs: 'min(52%, 380px)', sm: 'auto' },
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      bgcolor: 'background.paper', color: 'text.primary', borderColor: 'divider',
    }}>
      <BoxAny sx={{
        minHeight: 40, px: 1.25, display: 'flex', alignItems: 'center',
        bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider',
      }}>
        <Typography sx={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{t('chat.room.history')}</Typography>
        <Tooltip title={t('chat.room.closeHistory')}>
          <IconButton size="small" onClick={onClose} aria-label={t('chat.room.closeHistory')}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </BoxAny>
      <BoxAny ref={scrollRef} sx={{
        flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
        px: { xs: 0.9, sm: 1.8 }, py: 1.8,
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
      }}>
        {hasOlderMessages && (
          <BoxAny sx={{ pb: 1.5, textAlign: 'center' }}>
            <Button size="small" variant="outlined" disabled={loadingOlder} onClick={loadOlder}>
              {loadingOlder ? t('common.loading') : t('chat.room.loadEarlier')}
            </Button>
          </BoxAny>
        )}
        {messages.length === 0 ? (
          <Typography sx={{ py: 3, textAlign: 'center', color: 'text.secondary', fontSize: 12 }}>
            {t('chat.noMessagesShort')}
          </Typography>
        ) : messages.map((message, index) => {
          const previousMessage = index > 0 ? messages[index - 1] : null;
          const messageDate = new Date(message.timestamp);
          const previousTime = previousMessage ? new Date(previousMessage.timestamp).getTime() : 0;
          let timeSeparator: string | null = null;

          if (!previousMessage || messageDate.getTime() - previousTime >= 5 * 60 * 1000) {
            const now = new Date();
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const time = messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            if (messageDate.toDateString() === now.toDateString()) {
              timeSeparator = time;
            } else if (messageDate.toDateString() === yesterday.toDateString()) {
              timeSeparator = language === 'zh' ? `昨天 ${time}` : `Yesterday ${time}`;
            } else {
              timeSeparator = language === 'zh'
                ? `${messageDate.getMonth() + 1}月${messageDate.getDate()}日 ${time}`
                : `${messageDate.toLocaleDateString('en', { month: 'short', day: 'numeric' })} ${time}`;
            }
          }

          return (
            <MessageBubble
              key={message.id}
              message={message}
              isOwn={message.senderId === meId}
              showAvatar={!previousMessage || previousMessage.senderId !== message.senderId}
              layout="history"
              timeSeparator={timeSeparator}
              mentionableNames={mentionableNames}
            />
          );
        })}
      </BoxAny>
    </Paper>
  );
};

export const ChatRoom3D: React.FC<ChatRoom3DProps> = ({
  chat,
  me,
  messages,
  typingUsers,
  hasOlderMessages,
  onLoadOlderMessages,
}) => {
  const { t } = useLanguage();
  const [historyOpen, setHistoryOpen] = useState(false);
  const people = useMemo(() => buildRoomPeople(chat, me), [chat, me]);
  const participantIds = useMemo(() => new Set(people.map((person) => person.userId)), [people]);
  const historyMessages = useMemo(() => messages
    .filter((message) => !message.isDeleted && participantIds.has(message.senderId) && getMessagePreview(message)),
  [messages, participantIds]);
  const recentMessages = useMemo(() => messages
    .filter((message) => !message.isDeleted && participantIds.has(message.senderId) && getMessagePreview(message))
    .slice(-4), [messages, participantIds]);
  const latestBySender = useMemo(() => {
    const latest = new Map<string, Message>();
    for (const message of recentMessages) latest.set(message.senderId, message);
    return latest;
  }, [recentMessages]);
  const typingIds = useMemo(() => new Set(typingUsers.map((user) => user.userId)), [typingUsers]);
  const mentionableNames = useMemo(() => people.map((person) => person.displayName), [people]);

  return (
    <BoxAny sx={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <Canvas
        frameloop="demand"
        dpr={1}
        camera={{ fov: 55, position: [0, 2.0, 4.5], near: 0.1, far: 1000 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
        }}
      >
        <color attach="background" args={['#1a1a1a']} />
        <ambientLight intensity={0.6} />
        <directionalLight intensity={1.2} position={[6, 8, 6]} />
        <directionalLight intensity={0.4} position={[-5, 4, -4]} />
        <RoomCamera />
        <Suspense fallback={<LoadingOverlay />}>
          <RoomModels people={people} latestBySender={latestBySender} typingIds={typingIds} />
        </Suspense>
      </Canvas>
      <Tooltip title={t('chat.room.history')}>
        <IconButton
          size="small"
          onClick={() => setHistoryOpen((open) => !open)}
          aria-label={t('chat.room.history')}
          aria-expanded={historyOpen}
          sx={{
            position: 'absolute', zIndex: 35, top: 12, right: 12,
            width: 32, height: 32, color: historyOpen ? 'primary.contrastText' : 'text.primary',
            bgcolor: historyOpen ? 'primary.main' : 'background.paper',
            border: '1px solid', borderColor: historyOpen ? 'primary.main' : 'divider',
            '&:hover': { bgcolor: historyOpen ? 'primary.dark' : 'action.hover' },
          }}
        >
          <HistoryIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {historyOpen && (
        <MessageHistory
          messages={historyMessages}
          meId={me?.id}
          mentionableNames={mentionableNames}
          hasOlderMessages={hasOlderMessages}
          onLoadOlderMessages={onLoadOlderMessages}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </BoxAny>
  );
};

useGLTF.preload(ROOM_MODEL_URL);
useGLTF.preload(GIRL_ON_COUCH_URL);
useGLTF.preload(BEAUTY_GIRL_URL);
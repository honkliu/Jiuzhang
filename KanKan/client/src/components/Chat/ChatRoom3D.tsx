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

type Position = [number, number, number];

interface RoomPerson {
  userId: string;
  displayName: string;
}

const ROOM_MODEL_URL = '/models/room/newroom.glb';
const MALE_AVATAR_URL = '/models/avatars/asian_male.glb';
const FEMALE_AVATAR_URL = '/models/avatars/asian_female.glb';

type ActorAnimationName = 'standing' | 'talking' | 'walking' | 'dancing' | 'sitting';

interface ActorMotionUrls {
  standing: string;
  talking: string;
  walking: string;
  dancing: string;
}

const MALE_MOTIONS: ActorMotionUrls = {
  standing: '/models/animations/rpm/male_idle.glb',
  talking: '/models/animations/rpm/male_talk.glb',
  walking: '/models/animations/rpm/male_walk.glb',
  dancing: '/models/animations/rpm/male_dance.glb',
};

const FEMALE_MOTIONS: ActorMotionUrls = {
  standing: '/models/animations/rpm/female_idle.glb',
  talking: '/models/animations/rpm/female_talk.glb',
  walking: '/models/animations/rpm/female_walk.glb',
  dancing: '/models/animations/rpm/female_dance.glb',
};

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

const getActorAnimation = (message?: Message): ActorAnimationName => {
  const text = getMessagePreview(message).toLowerCase();
  if (/坐下|坐着|坐好|\bsit\b/.test(text)) return 'sitting';
  if (/站起|站起来|站着|\bstand\b/.test(text)) return 'standing';
  if (/跳舞|舞动|dance|哈哈|开心|高兴|太好了|\b(lol|haha)\b|[😄😁😂😊🤩🎉]/.test(text)) return 'dancing';
  if (/散步|走走|走路|walk/.test(text)) return 'walking';
  return 'talking';
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

  useLayoutEffect(() => {
    if (textRef.current) textRef.current.scrollTop = 0;
  }, [isTyping, message?.id]);

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
      <BoxAny
        ref={textRef}
        role="region"
        aria-label={`${person.displayName} message`}
        tabIndex={0}
        onPointerDown={(event: React.PointerEvent) => event.stopPropagation()}
        onWheel={(event: React.WheelEvent) => event.stopPropagation()}
        sx={{
        height: '4.2rem',
        overflowY: 'auto',
        overflowX: 'hidden',
        wordBreak: 'break-word',
        pointerEvents: 'auto',
        touchAction: 'pan-y',
        overscrollBehavior: 'contain',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        '&:focus-visible': { outline: `2px solid ${accent}`, outlineOffset: 1 },
      }}>
        <ChatMessageContent text={preview} mentionableNames={mentionableNames} compact />
      </BoxAny>
    </BoxAny>
  );
};

const AvatarActor: React.FC<{
  person: RoomPerson;
  modelUrl: string;
  motionUrls: ActorMotionUrls;
  position: Position;
  standingPosition?: Position;
  rotationY: number;
  bubblePosition: Position;
  latestMessage?: Message;
  isTyping: boolean;
  accent: string;
  mentionableNames: string[];
}> = ({ person, modelUrl, motionUrls, position, standingPosition = position, rotationY, bubblePosition, latestMessage, isTyping, accent, mentionableNames }) => {
  const gltf = useGLTF(modelUrl);
  const standingGltf = useGLTF(motionUrls.standing);
  const talkingGltf = useGLTF(motionUrls.talking);
  const walkingGltf = useGLTF(motionUrls.walking);
  const dancingGltf = useGLTF(motionUrls.dancing);
  const { invalidate } = useThree();
  const actorRef = useRef<THREE.Group | null>(null);
  const positionTargetRef = useRef(new THREE.Vector3(...position));
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const actorStateRef = useRef<'seated' | 'transitioning' | 'standing'>('seated');
  const sequenceTimersRef = useRef<number[]>([]);
  const activeUntilRef = useRef(0);
  const previousMessageIdRef = useRef(latestMessage?.id);
  const animatedModel = useMemo(() => {
    const clone = SkeletonUtils.clone(gltf.scene);
    let targetMesh: THREE.SkinnedMesh | undefined;

    clone.traverse((object) => {
      if (!targetMesh && object instanceof THREE.SkinnedMesh) targetMesh = object;
    });

    if (!targetMesh) {
      throw new Error(`Avatar animation rig is missing for ${modelUrl}`);
    }

    const directClip = (animations: THREE.AnimationClip[], name: ActorAnimationName) => {
      const clip = animations[0]?.clone();
      if (!clip) throw new Error(`Animation clip ${name} is missing`);
      clip.name = name;
      return clip;
    };

    targetMesh.skeleton.pose();
    const bones = new Map(targetMesh.skeleton.bones.map((bone) => [bone.name, bone]));
    const hip = bones.get('Hips');
    if (!hip) throw new Error(`Avatar hip bone is missing for ${modelUrl}`);

    const seatedHipPosition = hip.position.clone();
    seatedHipPosition.y *= 0.66;
    const sittingTracks: THREE.KeyframeTrack[] = [
      new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [
        ...seatedHipPosition.toArray(),
        ...seatedHipPosition.toArray(),
      ]),
    ];
    for (const [boneName, rotation] of [
      ['LeftUpLeg', Math.PI / 2],
      ['RightUpLeg', Math.PI / 2],
      ['LeftLeg', -Math.PI / 2],
      ['RightLeg', -Math.PI / 2],
    ] as const) {
      const bone = bones.get(boneName);
      if (!bone) continue;
      const seatedQuaternion = bone.quaternion.clone().multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation, 0, 0)),
      );
      sittingTracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, [0, 1], [
        ...seatedQuaternion.toArray(),
        ...seatedQuaternion.toArray(),
      ]));
    }
    const sittingClip = new THREE.AnimationClip('sitting', 1, sittingTracks);

    const clips: Record<ActorAnimationName, THREE.AnimationClip> = {
      standing: directClip(standingGltf.animations, 'standing'),
      talking: directClip(talkingGltf.animations, 'talking'),
      walking: directClip(walkingGltf.animations, 'walking'),
      dancing: directClip(dancingGltf.animations, 'dancing'),
      sitting: sittingClip,
    };

    targetMesh.skeleton.pose();
    fitToHeight(clone, 1.6);
    placeOnFloor(clone);
    return { model: clone, targetMesh, clips };
  }, [
    dancingGltf.animations,
    gltf.scene,
    modelUrl,
    standingGltf.animations,
    talkingGltf.animations,
    walkingGltf.animations,
  ]);

  const mixer = useMemo(() => new THREE.AnimationMixer(animatedModel.model), [animatedModel.model]);
  const playAnimation = useMemo(() => (
    name: ActorAnimationName,
    loop: boolean,
    fadeSeconds = 0.2,
  ) => {
    const clip = animatedModel.clips[name];
    const nextAction = mixer.clipAction(clip);
    const previousAction = currentActionRef.current;

    nextAction.reset();
    nextAction.enabled = true;
    nextAction.clampWhenFinished = !loop;
    nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    nextAction.play();
    if (previousAction && previousAction !== nextAction) {
      nextAction.crossFadeFrom(previousAction, fadeSeconds, false);
    }
    currentActionRef.current = nextAction;
    invalidate();
    return clip.duration;
  }, [animatedModel.clips, invalidate, mixer]);

  useEffect(() => {
    mixerRef.current = mixer;
    playAnimation('sitting', true, 0);
    return () => {
      for (const timer of sequenceTimersRef.current) window.clearTimeout(timer);
      sequenceTimersRef.current = [];
      mixer.stopAllAction();
      mixer.uncacheRoot(animatedModel.model);
      mixerRef.current = null;
    };
  }, [animatedModel.model, mixer, playAnimation]);

  useEffect(() => {
    if (!latestMessage?.id || previousMessageIdRef.current === latestMessage.id) return;
    previousMessageIdRef.current = latestMessage.id;

    for (const timer of sequenceTimersRef.current) window.clearTimeout(timer);
    sequenceTimersRef.current = [];

    const activity = getActorAnimation(latestMessage);
    if (activity === 'sitting') {
      actorStateRef.current = 'seated';
      positionTargetRef.current.set(...position);
      activeUntilRef.current = performance.now() + 1000;
      playAnimation('sitting', true);
      return;
    }

    const sitDown = () => {
      actorStateRef.current = 'transitioning';
      positionTargetRef.current.set(...position);
      playAnimation('sitting', true, 0.45);
      sequenceTimersRef.current.push(window.setTimeout(() => {
        actorStateRef.current = 'seated';
      }, 450));
    };
    const beginActivity = () => {
      actorStateRef.current = 'standing';
      playAnimation(activity, true);
      sequenceTimersRef.current.push(window.setTimeout(sitDown, activity === 'dancing' ? 4800 : 3800));
    };

    const standDuration = actorStateRef.current === 'seated' ? 0.45 : 0;
    positionTargetRef.current.set(...standingPosition);
    if (standDuration > 0) playAnimation('standing', true, standDuration);
    actorStateRef.current = 'transitioning';
    sequenceTimersRef.current.push(window.setTimeout(beginActivity, standDuration * 1000));
    activeUntilRef.current = performance.now() + standDuration * 1000 + 6500;

    return () => {
      for (const timer of sequenceTimersRef.current) window.clearTimeout(timer);
      sequenceTimersRef.current = [];
    };
  }, [
    latestMessage?.id,
    playAnimation,
    position[0],
    position[1],
    position[2],
    standingPosition[0],
    standingPosition[1],
    standingPosition[2],
  ]);

  useEffect(() => {
    if (actorStateRef.current !== 'seated') return;
    playAnimation('sitting', true);
  }, [isTyping, playAnimation]);

  useEffect(() => {
    const now = performance.now();
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

  useFrame((_, delta) => {
    mixerRef.current?.update(delta);
    const actor = actorRef.current;
    if (actor) {
      actor.position.x = THREE.MathUtils.damp(actor.position.x, positionTargetRef.current.x, 5, delta);
      actor.position.y = THREE.MathUtils.damp(actor.position.y, positionTargetRef.current.y, 5, delta);
      actor.position.z = THREE.MathUtils.damp(actor.position.z, positionTargetRef.current.z, 5, delta);
    }
  });

  return <>
    <group ref={actorRef} position={position} rotation={[0, rotationY, 0]}>
      <primitive object={animatedModel.model} />
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
        person={people[0]} modelUrl={MALE_AVATAR_URL} motionUrls={MALE_MOTIONS} position={[-1.0, 0, 1.1]}
        standingPosition={[-0.55, 0, 1.75]}
        rotationY={Math.PI / 2} bubblePosition={[-1.9, 2.2, 0.8]}
        latestMessage={latestBySender.get(people[0].userId)} isTyping={typingIds.has(people[0].userId)}
        accent="#2f7d5a" mentionableNames={mentionableNames}
      />}
      {people[1] && <AvatarActor
        person={people[1]} modelUrl={FEMALE_AVATAR_URL} motionUrls={FEMALE_MOTIONS} position={[1.6, 0, -1.2]}
        standingPosition={[1.85, 0, -0.75]}
        rotationY={-Math.PI * 0.15} bubblePosition={[1.6, 1.85, -1.2]}
        latestMessage={latestBySender.get(people[1].userId)} isTyping={typingIds.has(people[1].userId)}
        accent="#b66a4b" mentionableNames={mentionableNames}
      />}
    </>
  );
};

const RoomCamera: React.FC = () => {
  const { camera, size } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    const target = new THREE.Vector3(3.271, 1.9, 2.516);
    const desktopOffset = new THREE.Vector3(3.612, 1.9, 2.814).sub(target);
    const aspect = size.width / Math.max(size.height, 1);
    const distanceScale = aspect < 1 ? 1 + (1 - aspect) * 10 : 1;

    camera.position.copy(target).add(desktopOffset.multiplyScalar(distanceScale));
    controlsRef.current?.target.copy(target);
    controlsRef.current?.update();
  }, [camera, size.height, size.width]);

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
        style={{ width: '100%', height: '100%', display: 'block' }}
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
useGLTF.preload(MALE_AVATAR_URL);
useGLTF.preload(FEMALE_AVATAR_URL);
for (const url of [...Object.values(MALE_MOTIONS), ...Object.values(FEMALE_MOTIONS)]) {
  useGLTF.preload(url);
}
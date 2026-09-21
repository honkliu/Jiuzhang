import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import { Close as CloseIcon, History as HistoryIcon } from '@mui/icons-material';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, Html } from '@react-three/drei';
import { SkeletonUtils, type OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';

import { useLanguage } from '@/i18n/LanguageContext';
import type { Chat, Message, Participant } from '@/services/chat.service';
import { ImageHoverPreview } from '@/components/Shared/ImageHoverPreview';
import { ImageLightbox } from '@/components/Shared/ImageLightbox';
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
  onGenerateFromText?: (selectedText: string) => Promise<void>;
  imageGroups?: Array<{ sourceUrl: string; messageId: string; canEdit: boolean }>;
  imageGroupIndexByUrl?: Record<string, number>;
}

type Position = [number, number, number];
type Gesture = 'idle' | 'speaking' | 'agree' | 'question' | 'happy' | 'excited' | 'sad' | 'thinking';

interface RoomPerson {
  userId: string;
  displayName: string;
}

interface AvatarCalibration {
  visualScale?: number;
  seatOffset?: Position;
  skinTone?: {
    colorMultiplier: Position;
    emissive: THREE.ColorRepresentation;
    intensity: number;
  };
}

const ROOM_MODEL_URL = '/models/room/newroom.glb';
const MALE_AVATAR_URL = '/models/avatars/asian_male.glb';
const FEMALE_AVATAR_URL = '/models/avatars/asian_female.glb';
const CLASSIC_COUCH_AVATAR_URL = '/models/avatars/girl_on_couch_but_no_couch.glb';
const CLASSIC_SEATED_AVATAR_URL = '/models/avatars/sit_the_beauty_girl.glb';
const AVATAR_SELECTION_STORAGE_KEY = 'kankan.room3d.avatarSelections';
const AVATAR_BOUNDING_DIAMETER = 1.85;
const ROOM_SCALE = 0.8;
const ROOM_FLOOR_CENTER: Position = [3.182, 0, -0.062];
const SOFA_DEPTH_SCALE = 0.8;
const ASIAN_SKIN_TONE: NonNullable<AvatarCalibration['skinTone']> = {
  colorMultiplier: [1, 1.08, 1.08],
  emissive: '#ffe0b5',
  intensity: 0.24,
};

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

type AvatarId = 'asian-male' | 'asian-female' | 'classic-couch' | 'classic-seated';

interface AnimatedAvatarOption extends AvatarCalibration {
  id: AvatarId;
  kind: 'animated';
  labelKey: string;
  modelUrl: string;
  motionUrls: ActorMotionUrls;
}

interface StaticAvatarOption extends AvatarCalibration {
  id: AvatarId;
  kind: 'static';
  labelKey: string;
  modelUrl: string;
}

type AvatarOption = AnimatedAvatarOption | StaticAvatarOption;

const ANIMATED_AVATAR_OPTIONS: AnimatedAvatarOption[] = [
  {
    id: 'asian-male', kind: 'animated', labelKey: 'chat.room.avatar.asianMale',
    modelUrl: MALE_AVATAR_URL, motionUrls: MALE_MOTIONS,
    skinTone: ASIAN_SKIN_TONE,
  },
  {
    id: 'asian-female', kind: 'animated', labelKey: 'chat.room.avatar.asianFemale',
    modelUrl: FEMALE_AVATAR_URL, motionUrls: FEMALE_MOTIONS,
    skinTone: ASIAN_SKIN_TONE,
  },
];

const AVATAR_OPTIONS: AvatarOption[] = [
  ...ANIMATED_AVATAR_OPTIONS,
  {
    id: 'classic-seated', kind: 'static', labelKey: 'chat.room.avatar.classicSeated',
    modelUrl: CLASSIC_SEATED_AVATAR_URL, visualScale: 0.8, seatOffset: [0.12, 0.04, 0.15],
  },
  {
    id: 'classic-couch', kind: 'static', labelKey: 'chat.room.avatar.classicCouch',
    modelUrl: CLASSIC_COUCH_AVATAR_URL, seatOffset: [0.1, 0.07, 0.15],
  },
];

const loadAvatarSelections = (): Record<string, AvatarId> => {
  try {
    const stored = JSON.parse(localStorage.getItem(AVATAR_SELECTION_STORAGE_KEY) || '{}');
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
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

const getMessageImageUrl = (message?: Message) => {
  if (!message || message.messageType !== 'image') return '';
  const content = (message as Message & {
    content?: { mediaUrl?: string; thumbnailUrl?: string };
  }).content;
  return message.mediaUrl || message.thumbnailUrl || content?.mediaUrl || content?.thumbnailUrl || '';
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

const getActorAnimation = (message?: Message): ActorAnimationName => {
  const text = getMessagePreview(message).toLowerCase();
  if (/坐下|坐着|坐好|\bsit\b/.test(text)) return 'sitting';
  if (/站起|站起来|站着|\bstand\b/.test(text)) return 'standing';
  if (/跳舞|舞动|dance|哈哈|开心|高兴|太好了|\b(lol|haha)\b|[😄😁😂😊🤩🎉]/.test(text)) return 'dancing';
  if (/散步|走走|走路|walk/.test(text)) return 'walking';
  return 'talking';
};

const fitToAvatarSize = (model: THREE.Object3D, visualScale = 1) => {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const diameter = size.length();
  if (diameter <= 0) return;
  const scale = AVATAR_BOUNDING_DIAMETER / diameter * visualScale;
  model.scale.setScalar(scale);
};

const applySkinTone = (model: THREE.Object3D, skinTone?: AvatarCalibration['skinTone']) => {
  if (!skinTone) return;

  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const materials = sourceMaterials.map((sourceMaterial) => {
      if (!(sourceMaterial instanceof THREE.MeshStandardMaterial)
        || !/^Wolf3D_(Skin|Body)$/.test(sourceMaterial.name)) return sourceMaterial;

      const material = sourceMaterial.clone();
      material.color.setRGB(...skinTone.colorMultiplier);
      material.emissive.set(skinTone.emissive);
      material.emissiveMap = null;
      material.emissiveIntensity = skinTone.intensity;
      material.needsUpdate = true;
      return material;
    });
    object.material = Array.isArray(object.material) ? materials : materials[0];
  });
};

const configureAvatarTextures = (model: THREE.Object3D, anisotropy: number) => {
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      for (const texture of [
        material.map,
        material.normalMap,
        material.roughnessMap,
        material.metalnessMap,
        material.aoMap,
      ]) {
        if (!texture) continue;
        texture.anisotropy = anisotropy;
        texture.needsUpdate = true;
      }
    }
  });
};

const placeOnFloor = (model: THREE.Object3D) => {
  const box = new THREE.Box3().setFromObject(model);
  const minY = box.min.y;
  model.position.y -= minY;
};

const scaleWithRoom = ([x, y, z]: Position): Position => [
  ROOM_FLOOR_CENTER[0] + (x - ROOM_FLOOR_CENTER[0]) * ROOM_SCALE,
  y,
  ROOM_FLOOR_CENTER[2] + (z - ROOM_FLOOR_CENTER[2]) * ROOM_SCALE,
];

const compressSofaDepth = (room: THREE.Object3D) => {
  const sofa = room.getObjectByName('sofa');
  const meshes = sofa?.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh) ?? [];
  const bounds = new THREE.Box3();

  for (const mesh of meshes) {
    mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) bounds.union(mesh.geometry.boundingBox);
  }
  if (bounds.isEmpty()) return;

  const centerY = (bounds.min.y + bounds.max.y) / 2;
  for (const mesh of meshes) {
    const geometry = mesh.geometry.clone();
    geometry.translate(0, -centerY, 0);
    geometry.scale(1, SOFA_DEPTH_SCALE, 1);
    geometry.translate(0, centerY, 0);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    mesh.geometry = geometry;
  }
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
  onOpenImage?: (message: Message, imageUrl: string) => void;
  editActionLabel: string;
}> = ({
  person,
  message,
  isTyping,
  accent,
  mentionableNames,
  onOpenImage,
  editActionLabel,
}) => {
  const preview = isTyping ? '...' : getMessagePreview(message);
  const imageUrl = isTyping ? '' : getMessageImageUrl(message);
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
          height: imageUrl ? 'auto' : '4.2rem',
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
        {imageUrl ? (
          <ImageHoverPreview
            src={imageUrl}
            alt={`${person.displayName} photo`}
            openOnHover
            openOnClick
            openOnTap
            openOnLongPress={false}
            onPreviewAction={message && onOpenImage
              ? () => onOpenImage(message, imageUrl)
              : undefined}
            previewActionLabel={editActionLabel}
          >
            {(previewProps) => (
              <BoxAny
                {...previewProps}
                component="img"
                src={imageUrl}
                alt={`${person.displayName} photo`}
                sx={{
                  display: 'block',
                  width: 'auto',
                  maxWidth: { xs: 56, sm: 110 },
                  height: 'auto',
                  maxHeight: { xs: 88, sm: 140 },
                  mx: 'auto',
                  objectFit: 'contain',
                  borderRadius: '3px',
                  cursor: onOpenImage ? 'pointer' : 'default',
                  transition: 'opacity 0.15s',
                  '&:hover': { opacity: 0.85 },
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                }}
              />
            )}
          </ImageHoverPreview>
        ) : (
          <ChatMessageContent text={preview} mentionableNames={mentionableNames} compact />
        )}
      </BoxAny>
    </BoxAny>
  );
};

interface AvatarActorProps {
  person: RoomPerson;
  position: Position;
  standingPosition?: Position;
  rotationY: number;
  bubblePosition: Position;
  latestMessage?: Message;
  isTyping: boolean;
  accent: string;
  phase: number;
  mentionableNames: string[];
  onSelect: () => void;
  onOpenImage: (message: Message, imageUrl: string) => void;
  canEditImage: (imageUrl: string) => boolean;
  editActionLabel: string;
}

const AvatarPicker: React.FC<{
  person: RoomPerson;
  options: AvatarOption[];
  selectedId: AvatarId;
  onSelect: (id: AvatarId) => void;
  onClose: () => void;
}> = ({ person, options, selectedId, onSelect, onClose }) => {
  const { t } = useLanguage();

  return (
    <Paper variant="outlined" sx={{
      position: 'absolute', zIndex: 50, top: 52, right: { xs: 8, sm: 12 },
      width: 196, maxWidth: 'calc(100% - 16px)', p: 1,
      bgcolor: 'background.paper', color: 'text.primary', borderColor: 'divider',
    }}>
      <BoxAny sx={{ mb: 1, pl: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700 }} noWrap>
          {person.displayName} · {t('chat.room.chooseAvatar')}
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label={t('chat.room.closeAvatarPicker')}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </BoxAny>
      <BoxAny sx={{ display: 'grid', gap: 0.75 }}>
        {options.map((option) => (
          <Button
            key={option.id}
            variant={selectedId === option.id ? 'contained' : 'text'}
            onClick={() => onSelect(option.id)}
            sx={{ justifyContent: 'flex-start' }}
          >
            {t(option.labelKey)}
          </Button>
        ))}
      </BoxAny>
    </Paper>
  );
};

const AnimatedAvatarActor: React.FC<AvatarActorProps & { avatar: AnimatedAvatarOption }> = ({
  avatar, person, position, standingPosition = position, rotationY, bubblePosition,
  latestMessage, isTyping, accent, mentionableNames, onSelect, onOpenImage, canEditImage,
  editActionLabel,
}) => {
  const gltf = useGLTF(avatar.modelUrl);
  const standingGltf = useGLTF(avatar.motionUrls.standing);
  const talkingGltf = useGLTF(avatar.motionUrls.talking);
  const walkingGltf = useGLTF(avatar.motionUrls.walking);
  const dancingGltf = useGLTF(avatar.motionUrls.dancing);
  const { gl, invalidate } = useThree();
  const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
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
      throw new Error(`Avatar animation rig is missing for ${avatar.modelUrl}`);
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
    if (!hip) throw new Error(`Avatar hip bone is missing for ${avatar.modelUrl}`);

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
    applySkinTone(clone, avatar.skinTone);
    configureAvatarTextures(clone, maxAnisotropy);
    fitToAvatarSize(clone, avatar.visualScale);
    placeOnFloor(clone);
    return { model: clone, targetMesh, clips };
  }, [
    dancingGltf.animations,
    gltf.scene,
    avatar.modelUrl,
    avatar.skinTone,
    maxAnisotropy,
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
    <group
      ref={actorRef}
      position={position}
      rotation={[0, rotationY, 0]}
      onClick={(event) => {
        event.stopPropagation();
        document.body.style.cursor = '';
        onSelect();
      }}
      onPointerEnter={(event) => {
        event.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerLeave={() => { document.body.style.cursor = ''; }}
    >
      <primitive object={animatedModel.model} />
    </group>
    <Html position={bubblePosition} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
      <SpeechBubble
        person={person}
        message={latestMessage}
        isTyping={isTyping}
        accent={accent}
        mentionableNames={mentionableNames}
        onOpenImage={getMessageImageUrl(latestMessage) && canEditImage(getMessageImageUrl(latestMessage))
          ? onOpenImage
          : undefined}
        editActionLabel={editActionLabel}
      />
    </Html>
  </>;
};

const StaticAvatarActor: React.FC<AvatarActorProps & { avatar: StaticAvatarOption }> = ({
  avatar, person, position, rotationY, bubblePosition, latestMessage,
  isTyping, accent, phase, mentionableNames, onSelect, onOpenImage, canEditImage,
  editActionLabel,
}) => {
  const gltf = useGLTF(avatar.modelUrl);
  const { gl, invalidate } = useThree();
  const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
  const actorRef = useRef<THREE.Group | null>(null);
  const activeUntilRef = useRef(0);
  const previousMessageIdRef = useRef(latestMessage?.id);
  const seatedPosition: Position = [
    position[0] + (avatar.seatOffset?.[0] ?? 0),
    position[1] + (avatar.seatOffset?.[1] ?? 0),
    position[2] + (avatar.seatOffset?.[2] ?? 0),
  ];
  const model = useMemo(() => {
    const clone = gltf.scene.clone(true);
    configureAvatarTextures(clone, maxAnisotropy);
    fitToAvatarSize(clone, avatar.visualScale);
    placeOnFloor(clone);
    return clone;
  }, [gltf.scene, maxAnisotropy]);
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

    actor.position.y = THREE.MathUtils.damp(actor.position.y, seatedPosition[1] + lift, 7, delta);
    actor.rotation.x = THREE.MathUtils.damp(actor.rotation.x, lean, 7, delta);
    actor.rotation.y = THREE.MathUtils.damp(actor.rotation.y, rotationY + turn, 7, delta);
    actor.rotation.z = THREE.MathUtils.damp(actor.rotation.z, tilt, 7, delta);
  });

  return <>
    <group
      ref={actorRef}
      position={seatedPosition}
      rotation={[0, rotationY, 0]}
      onClick={(event) => {
        event.stopPropagation();
        document.body.style.cursor = '';
        onSelect();
      }}
      onPointerEnter={(event) => {
        event.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerLeave={() => { document.body.style.cursor = ''; }}
    >
      <primitive object={model} />
    </group>
    <Html position={bubblePosition} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
      <SpeechBubble
        person={person}
        message={latestMessage}
        isTyping={isTyping}
        accent={accent}
        mentionableNames={mentionableNames}
        onOpenImage={getMessageImageUrl(latestMessage) && canEditImage(getMessageImageUrl(latestMessage))
          ? onOpenImage
          : undefined}
        editActionLabel={editActionLabel}
      />
    </Html>
  </>;
};

const RoomAvatar: React.FC<AvatarActorProps & { avatar: AvatarOption }> = (props) => (
  props.avatar.kind === 'animated'
    ? <AnimatedAvatarActor {...props} avatar={props.avatar} />
    : <StaticAvatarActor {...props} avatar={props.avatar} />
);

const RoomModels: React.FC<{
  people: RoomPerson[];
  latestBySender: Map<string, Message>;
  typingIds: Set<string>;
  avatarSelections: Record<string, AvatarId>;
  onPickAvatar: (slot: 0 | 1) => void;
  onOpenImage: (message: Message, imageUrl: string) => void;
  canEditImage: (imageUrl: string) => boolean;
  editActionLabel: string;
}> = ({
  people,
  latestBySender,
  typingIds,
  avatarSelections,
  onPickAvatar,
  onOpenImage,
  canEditImage,
  editActionLabel,
}) => {
  const roomGltf = useGLTF(ROOM_MODEL_URL);
  const roomScene = useMemo(() => {
    const clone = roomGltf.scene.clone(true);
    compressSofaDepth(clone);
    return clone;
  }, [roomGltf.scene]);
  const mentionableNames = people.map((person) => person.displayName);
  const leftAvatar = AVATAR_OPTIONS.find((option) => option.id === avatarSelections[people[0]?.userId])
    ?? AVATAR_OPTIONS[0];
  const rightAvatar = AVATAR_OPTIONS.find((option) => option.id === avatarSelections[people[1]?.userId])
    ?? AVATAR_OPTIONS[1];

  return (
    <>
      <group position={ROOM_FLOOR_CENTER} scale={ROOM_SCALE}>
        <primitive
          object={roomScene}
          position={[-ROOM_FLOOR_CENTER[0], -ROOM_FLOOR_CENTER[1], -ROOM_FLOOR_CENTER[2]]}
        />
      </group>
      {people[0] && <RoomAvatar
        key={`${people[0].userId}:${leftAvatar.id}`} person={people[0]} avatar={leftAvatar}
        position={scaleWithRoom([-1.0, 0, 1.1])}
        standingPosition={scaleWithRoom([-0.55, 0, 1.75])}
        rotationY={Math.PI / 2} bubblePosition={scaleWithRoom([-1.9, 2.2, 0.8])}
        latestMessage={latestBySender.get(people[0].userId)} isTyping={typingIds.has(people[0].userId)}
        accent="#2f7d5a" phase={0} mentionableNames={mentionableNames} onSelect={() => onPickAvatar(0)}
        onOpenImage={onOpenImage}
        canEditImage={canEditImage}
        editActionLabel={editActionLabel}
      />}
      {people[1] && <RoomAvatar
        key={`${people[1].userId}:${rightAvatar.id}`} person={people[1]} avatar={rightAvatar}
        position={scaleWithRoom([1.6, 0, -1.2])}
        standingPosition={scaleWithRoom([1.85, 0, -0.75])}
        rotationY={-Math.PI * 0.15} bubblePosition={scaleWithRoom([1.6, 1.85, -1.2])}
        latestMessage={latestBySender.get(people[1].userId)} isTyping={typingIds.has(people[1].userId)}
        accent="#b66a4b" phase={Math.PI} mentionableNames={mentionableNames} onSelect={() => onPickAvatar(1)}
        onOpenImage={onOpenImage}
        canEditImage={canEditImage}
        editActionLabel={editActionLabel}
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
  onGenerateFromText?: (selectedText: string) => Promise<void>;
  imageGroups?: Array<{ sourceUrl: string; messageId: string; canEdit: boolean }>;
  imageGroupIndexByUrl?: Record<string, number>;
  onClose: () => void;
}> = ({
  messages,
  meId,
  mentionableNames,
  hasOlderMessages,
  onLoadOlderMessages,
  onGenerateFromText,
  imageGroups,
  imageGroupIndexByUrl,
  onClose,
}) => {
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
      top: { xs: 0, sm: 12 }, right: { xs: 0, sm: 12 },
      bottom: { xs: 0, sm: 12 }, left: { xs: 0, sm: 'auto' },
      width: { sm: 360 }, height: { xs: '100%', sm: 'auto' },
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      borderRadius: { xs: 0, sm: 1 },
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
          const imageUrl = getMessageImageUrl(message);
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
              onGenerateFromText={onGenerateFromText}
              imageGallery={imageGroups?.map((group) => group.sourceUrl)}
              imageIndex={imageUrl ? imageGroupIndexByUrl?.[imageUrl] : undefined}
              imageGroups={imageGroups}
              imageGroupIndex={imageUrl ? imageGroupIndexByUrl?.[imageUrl] : undefined}
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
  onGenerateFromText,
  imageGroups,
  imageGroupIndexByUrl,
}) => {
  const { t } = useLanguage();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [avatarSelections, setAvatarSelections] = useState<Record<string, AvatarId>>(loadAvatarSelections);
  const [avatarPickerSlot, setAvatarPickerSlot] = useState<0 | 1 | null>(null);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number; groupIndex?: number } | null>(null);
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
  const galleryImages = useMemo(
    () => imageGroups?.map((group) => group.sourceUrl) ?? [],
    [imageGroups],
  );

  const openImage = (message: Message, imageUrl: string) => {
    const groupIndex = imageGroupIndexByUrl?.[imageUrl];
    setLightbox({
      images: galleryImages.length > 0 ? galleryImages : [imageUrl],
      index: typeof groupIndex === 'number' ? groupIndex : 0,
      groupIndex,
    });
  };
  const canEditImage = (imageUrl: string) => {
    const groupIndex = imageGroupIndexByUrl?.[imageUrl];
    return typeof groupIndex === 'number' && imageGroups?.[groupIndex]?.canEdit === true;
  };

  useEffect(() => {
    localStorage.setItem(AVATAR_SELECTION_STORAGE_KEY, JSON.stringify(avatarSelections));
  }, [avatarSelections]);

  return (
    <BoxAny sx={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <Canvas
        style={{ width: '100%', height: '100%', display: 'block' }}
        frameloop="demand"
        dpr={[1.5, 2]}
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
          <RoomModels
            people={people}
            latestBySender={latestBySender}
            typingIds={typingIds}
            avatarSelections={avatarSelections}
            onPickAvatar={(slot) => {
              setHistoryOpen(false);
              setAvatarPickerSlot(slot);
            }}
            onOpenImage={openImage}
            canEditImage={canEditImage}
            editActionLabel={t('image.editAction')}
          />
        </Suspense>
      </Canvas>
      {avatarPickerSlot !== null && people[avatarPickerSlot] && (() => {
        const person = people[avatarPickerSlot];
        const selectedId = AVATAR_OPTIONS.some((option) => option.id === avatarSelections[person.userId])
          ? avatarSelections[person.userId]
          : AVATAR_OPTIONS[avatarPickerSlot].id;
        return (
          <AvatarPicker
            person={person}
            options={AVATAR_OPTIONS}
            selectedId={selectedId}
            onSelect={(id) => {
              setAvatarSelections((current) => ({ ...current, [person.userId]: id }));
              setAvatarPickerSlot(null);
            }}
            onClose={() => setAvatarPickerSlot(null)}
          />
        );
      })()}
      <Tooltip title={t('chat.room.history')}>
        <IconButton
          size="small"
          onClick={() => {
            setAvatarPickerSlot(null);
            setHistoryOpen((open) => !open);
          }}
          aria-label={t('chat.room.history')}
          aria-expanded={historyOpen}
          sx={{
            position: 'absolute', zIndex: 35, top: 12, right: 12,
            width: 32, height: 32, color: 'text.primary',
            bgcolor: 'background.paper',
            border: '1px solid', borderColor: historyOpen ? 'primary.main' : 'divider',
            boxShadow: historyOpen ? (theme) => `inset 0 0 0 1px ${theme.palette.primary.main}` : 'none',
            '&:hover': { bgcolor: 'action.hover' },
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
          onGenerateFromText={onGenerateFromText}
          imageGroups={imageGroups}
          imageGroupIndexByUrl={imageGroupIndexByUrl}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          groups={imageGroups}
          initialGroupIndex={lightbox.groupIndex}
          open
          onClose={() => setLightbox(null)}
        />
      )}
    </BoxAny>
  );
};

useGLTF.preload(ROOM_MODEL_URL);
useGLTF.preload(MALE_AVATAR_URL);
useGLTF.preload(FEMALE_AVATAR_URL);
useGLTF.preload(CLASSIC_COUCH_AVATAR_URL);
useGLTF.preload(CLASSIC_SEATED_AVATAR_URL);
for (const url of [...Object.values(MALE_MOTIONS), ...Object.values(FEMALE_MOTIONS)]) {
  useGLTF.preload(url);
}
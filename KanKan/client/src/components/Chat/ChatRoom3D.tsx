import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Text, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

import type { Chat, Message } from '@/services/chat.service';
import type { User } from '@/types';
import { getDirectDisplayParticipant, getRealParticipants } from '@/utils/chatParticipants';
import { useLanguage } from '@/i18n/LanguageContext';

type TypingUser = { userId: string; userName: string };

const REFERENCE_IMAGE_URL =
  'https://petoskeyarea.com/wp-content/uploads/2025/11/Petoskey_Spring-54901.jpg';

const ROOM_MODEL_URL =
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/minimalistic_modern_bedroom.glb';

const HDRI_URL =
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_03_1k.hdr';

export interface ChatRoom3DProps {
  chat: Chat;
  me: User | null;
  messages: Message[];
  typingUsers: TypingUser[];
}

const clampLine = (s: string, max = 42): string => {
  const normalized = (s ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1))}…`;
};

const formatWallFeed = (
  messages: Message[],
  labels: { file: string; image: string },
  maxLines = 8
): string => {
  const items = messages
    .filter((m) => !m.isDeleted)
    .slice(-50)
    .filter((m) => m.messageType === 'text' || m.messageType === 'file' || m.messageType === 'image')
    .slice(-maxLines);

  return items
    .map((m) => {
      const body =
        m.messageType === 'text'
          ? (m.text ?? '')
          : m.messageType === 'file'
            ? `[${labels.file}] ${m.fileName ?? ''}`
            : `[${labels.image}]`;
      return clampLine(`${m.senderName}: ${body}`);
    })
    .join('\n');
};

const buildFallbackPortrait = (name: string, tint: string): THREE.Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, tint);
    gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(18, 18, canvas.width - 36, canvas.height - 36);

    ctx.fillStyle = '#f3d5c1';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, 120, 46, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2f2f2f';
    ctx.fillRect(canvas.width / 2 - 70, 170, 140, 85);

    const initials = name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('');
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(initials || '🙂', canvas.width / 2, 285);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const RoomModel: React.FC = () => {
  const gltf = useGLTF(ROOM_MODEL_URL);

  const scene = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    cloned.traverse((obj: any) => {
      if (obj?.isMesh) {
        const name = `${obj.name ?? ''}`.toLowerCase();
        const matName = `${obj.material?.name ?? ''}`.toLowerCase();
        if (name.includes('bed') || matName.includes('bed')) {
          obj.visible = false;
        }
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (obj.material) {
          obj.material.envMapIntensity = 1.0;
          obj.material.needsUpdate = true;
        }
      }
    });
    return cloned;
  }, [gltf.scene]);

  return (
    <primitive
      object={scene}
      scale={1.2}
      position={[0, -0.35, 0.2]}
      rotation={[0, Math.PI / 2, 0]}
    />
  );
};

useGLTF.preload(ROOM_MODEL_URL);

const usePortraitTexture = (imageUrl: string | undefined, name: string, tint: string) =>
  useMemo(() => {
    if (imageUrl) {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      const tex = loader.load(imageUrl);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    return buildFallbackPortrait(name, tint);
  }, [imageUrl, name, tint]);

const useReferenceTexture = () =>
  useMemo(() => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const tex = loader.load(REFERENCE_IMAGE_URL);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, []);

const AvatarPortrait: React.FC<{
  name: string;
  tint: string;
  imageUrl?: string;
  position: [number, number, number];
  facing: 1 | -1;
  isTalking: boolean;
  bubbleText?: string;
}> = ({ name, tint, imageUrl, position, facing, isTalking, bubbleText }) => {
  const groupRef = useRef<THREE.Group>(null);
  const portraitTexture = usePortraitTexture(imageUrl, name, tint);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;

    const t = state.clock.getElapsedTime();
    const talk = isTalking ? 1 : 0;
    g.position.y = position[1] + Math.sin(t * (1.1 + talk * 2.0)) * (0.015 + talk * 0.012);
    g.rotation.y = facing === 1 ? Math.PI * 0.14 : -Math.PI * 0.14;
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Portrait stand */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.12, 0.7, 16]} />
        <meshStandardMaterial color={'#6b4b3e'} roughness={0.6} />
      </mesh>

      {/* Frame */}
      <mesh position={[0, 0.82, 0]} castShadow>
        <boxGeometry args={[0.62, 0.94, 0.06]} />
        <meshStandardMaterial color={'#2b2b2b'} roughness={0.5} />
      </mesh>

      {/* Portrait image */}
      <mesh position={[0, 0.82, 0.035]} castShadow>
        <planeGeometry args={[0.54, 0.86]} />
        <meshStandardMaterial map={portraitTexture} roughness={0.8} metalness={0} />
      </mesh>

      {/* Name tag */}
      <Text
        position={[0, 0.15, 0.18]}
        fontSize={0.11}
        color={'#0f172a'}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.004}
        outlineColor="rgba(255,255,255,0.9)"
      >
        {name}
      </Text>

      {/* Bubble */}
      {bubbleText ? (
        <group position={[0, 1.36, 0]}>
          <mesh>
            <boxGeometry args={[1.55, 0.48, 0.04]} />
            <meshStandardMaterial color={'#ffffff'} roughness={0.8} metalness={0} />
          </mesh>
          <Text
            position={[0, 0, 0.02]}
            fontSize={0.10}
            color={'#0f172a'}
            anchorX="center"
            anchorY="middle"
            maxWidth={1.45}
            lineHeight={1.05}
          >
            {bubbleText}
          </Text>
        </group>
      ) : null}
    </group>
  );
};

const RoomFallback: React.FC = () => (
  <group>
    <ambientLight intensity={0.6} />
    <directionalLight intensity={0.8} position={[3, 5, 3]} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[6, 6]} />
      <meshStandardMaterial color={'#e8e2d9'} roughness={0.9} />
    </mesh>
  </group>
);

const RoomScene: React.FC<{
  meName: string;
  otherName: string;
  wallText: string;
  sayHiText: string;
  meBubble?: string;
  otherBubble?: string;
  talkingId?: 'me' | 'other' | null;
  meAvatarUrl?: string;
  otherAvatarUrl?: string;
}> = ({
  meName,
  otherName,
  wallText,
  sayHiText,
  meBubble,
  otherBubble,
  talkingId,
  meAvatarUrl,
  otherAvatarUrl,
}) => {
  const referenceTexture = useReferenceTexture();

  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight
        intensity={1.1}
        position={[4.2, 6.0, 3.2]}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <spotLight
        intensity={0.7}
        angle={0.45}
        penumbra={0.5}
        position={[-2.5, 3.2, 2.2]}
        target-position={[0, 0, -1.5]}
      />

      {/* Real room model */}
      <RoomModel />

      {/* Wall art from reference photo */}
      <mesh position={[1.6, 1.55, -1.8]}>
        <boxGeometry args={[1.45, 1.0, 0.06]} />
        <meshStandardMaterial color={'#cbb8a6'} roughness={0.7} />
      </mesh>
      <mesh position={[1.6, 1.55, -1.76]}>
        <planeGeometry args={[1.3, 0.85]} />
        <meshStandardMaterial map={referenceTexture} roughness={0.85} />
      </mesh>

      {/* Wall feed panel */}
      <mesh position={[-1.0, 1.5, -1.7]}>
        <boxGeometry args={[1.5, 0.8, 0.05]} />
        <meshStandardMaterial color={'#f8f6f2'} roughness={0.8} />
      </mesh>

      {/* Round red-oak table */}
      <mesh position={[0.1, 0.28, 0.15]} castShadow receiveShadow>
        <cylinderGeometry args={[0.55, 0.55, 0.06, 32]} />
        <meshStandardMaterial color={'#a45a2a'} roughness={0.6} metalness={0.05} />
      </mesh>
      <mesh position={[0.1, 0.14, 0.15]} castShadow receiveShadow>
        <cylinderGeometry args={[0.08, 0.12, 0.25, 16]} />
        <meshStandardMaterial color={'#8b4e24'} roughness={0.7} />
      </mesh>

      {/* Two low sofas */}
      <mesh position={[-1.0, 0.35, 0.65]} castShadow receiveShadow>
        <boxGeometry args={[1.4, 0.4, 0.6]} />
        <meshStandardMaterial color={'#c7a68a'} roughness={0.9} />
      </mesh>
      <mesh position={[-1.0, 0.55, 0.35]} castShadow>
        <boxGeometry args={[1.4, 0.25, 0.25]} />
        <meshStandardMaterial color={'#b79272'} roughness={0.9} />
      </mesh>

      <mesh position={[1.15, 0.35, -0.15]} castShadow receiveShadow>
        <boxGeometry args={[1.4, 0.4, 0.6]} />
        <meshStandardMaterial color={'#c7a68a'} roughness={0.9} />
      </mesh>
      <mesh position={[1.15, 0.55, -0.45]} castShadow>
        <boxGeometry args={[1.4, 0.25, 0.25]} />
        <meshStandardMaterial color={'#b79272'} roughness={0.9} />
      </mesh>

      {/* Wall feed */}
      <Text
        position={[-1.0, 1.72, -1.66]}
        fontSize={0.09}
        color={'#0f172a'}
        anchorX="center"
        anchorY="top"
        maxWidth={1.35}
        lineHeight={1.15}
      >
        {wallText || sayHiText}
      </Text>

      {/* Avatars */}
      <AvatarPortrait
        name={meName}
        tint={'#7c9fcb'}
        imageUrl={meAvatarUrl}
        position={[-0.8, 0.55, 0.75]}
        facing={1}
        isTalking={talkingId === 'me'}
        bubbleText={meBubble}
      />
      <AvatarPortrait
        name={otherName}
        tint={'#8bbf8a'}
        imageUrl={otherAvatarUrl}
        position={[0.75, 0.55, -0.85]}
        facing={-1}
        isTalking={talkingId === 'other'}
        bubbleText={otherBubble}
      />
    </>
  );
};

export const ChatRoom3D: React.FC<ChatRoom3DProps> = ({ chat, me, messages, typingUsers }) => {
  const { t, language } = useLanguage();
  const meId = me?.id;
  const meParticipant = useMemo(
    () => (meId ? chat.participants.find((p) => p.userId === meId) : undefined),
    [chat.participants, meId]
  );

  const otherParticipant = useMemo(
    () => getDirectDisplayParticipant(chat, meId),
    [chat, meId]
  );

  const meName = meParticipant?.displayName || me?.displayName || t('chat.room.me');
  const otherName = otherParticipant?.displayName || chat.name || t('chat.room.friend');
  const meAvatarUrl = meParticipant?.avatarUrl || me?.avatarUrl || undefined;
  const otherAvatarUrl = otherParticipant?.avatarUrl || undefined;

  const wallLabels = useMemo(
    () => ({ file: t('chat.room.file'), image: t('chat.room.image') }),
    [language, t]
  );
  const wallText = useMemo(() => formatWallFeed(messages, wallLabels), [messages, wallLabels]);

  const lastMessage = useMemo(() => {
    const list = messages.filter((m) => !m.isDeleted);
    return list.length > 0 ? list[list.length - 1] : null;
  }, [messages]);

  const [bubble, setBubble] = useState<{ senderId: string; text: string; at: number } | null>(null);

  useEffect(() => {
    if (!lastMessage) return;

    const body =
      lastMessage.messageType === 'text'
        ? (lastMessage.text ?? '').trim()
        : lastMessage.messageType === 'file'
          ? `[${t('chat.room.file')}] ${lastMessage.fileName ?? ''}`
          : lastMessage.messageType === 'image'
            ? `[${t('chat.room.image')}]`
            : `[${lastMessage.messageType}]`;

    const trimmed = clampLine(body, 60);
    if (!trimmed) return;

    setBubble({ senderId: lastMessage.senderId, text: trimmed, at: Date.now() });
  }, [lastMessage?.id]);

  const isOtherTyping = useMemo(() => {
    if (!meId) return false;
    const realTyping = typingUsers.filter((t) => t.userId !== meId);
    return realTyping.length > 0;
  }, [typingUsers, meId]);

  const meBubble = useMemo(() => {
    if (!bubble || bubble.senderId !== meId) return undefined;
    if (Date.now() - bubble.at > 3500) return undefined;
    return bubble.text;
  }, [bubble, meId]);

  const otherBubble = useMemo(() => {
    if (isOtherTyping) return t('chat.room.typing');
    if (!bubble) return undefined;

    const otherId = otherParticipant?.userId;
    if (!otherId || bubble.senderId !== otherId) return undefined;
    if (Date.now() - bubble.at > 3500) return undefined;
    return bubble.text;
  }, [bubble, isOtherTyping, otherParticipant?.userId]);

  const talkingId = useMemo(() => {
    if (isOtherTyping) return 'other' as const;
    if (!bubble) return null;

    if (meId && bubble.senderId === meId && Date.now() - bubble.at <= 3500) return 'me' as const;
    if (otherParticipant?.userId && bubble.senderId === otherParticipant.userId && Date.now() - bubble.at <= 3500)
      return 'other' as const;

    return null;
  }, [bubble, isOtherTyping, meId, otherParticipant?.userId]);

  // For group chats, this prototype still shows a 2-person “scene” using the first display participant.
  // Real participant count is computed so we can later expand to multi-avatar layouts.
  const _realCount = useMemo(() => getRealParticipants(chat.participants).length, [chat.participants]);
  void _realCount;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{
          physicallyCorrectLights: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          outputColorSpace: THREE.SRGBColorSpace,
          toneMappingExposure: 1.15,
        }}
        camera={{ position: [0, 1.45, 3.6], fov: 42, near: 0.1, far: 100 }}
      >
        <color attach="background" args={['#f2efe9']} />
        <fog attach="fog" args={['#f2efe9', 6, 14]} />
        <Suspense fallback={<RoomFallback />}>
          <Environment files={HDRI_URL} />
          <group position={[0, 0, 0]}>
            <RoomScene
              meName={meName}
              otherName={otherName}
              wallText={wallText}
              sayHiText={t('chat.room.sayHi')}
              meBubble={meBubble}
              otherBubble={otherBubble}
              talkingId={talkingId}
              meAvatarUrl={meAvatarUrl}
              otherAvatarUrl={otherAvatarUrl}
            />
          </group>
        </Suspense>
        <ContactShadows position={[0, 0.02, 0.2]} opacity={0.32} scale={6} blur={1.6} far={3.8} />
      </Canvas>
    </div>
  );
};

import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, Html } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';

import type { Chat, Message } from '@/services/chat.service';
import type { User } from '@/types';

export interface ChatRoom3DProps {
  chat: Chat;
  me: User | null;
  messages: Message[];
  typingUsers: { userId: string; userName: string }[];
}

const ROOM_MODEL_URL = '/models/room/newroom.glb';
const GIRL_ON_COUCH_URL = '/models/avatars/girl_on_couch_but_no_couch.glb';
const BEAUTY_GIRL_URL = '/models/avatars/sit_the_beauty_girl.glb';

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
    <div
      style={{
        padding: '8px 10px',
        background: 'rgba(0,0,0,0.55)',
        color: '#fff',
        fontFamily: 'monospace',
        fontSize: 12,
        borderRadius: 4,
      }}
    >
      Loading room and avatars...
    </div>
  </Html>
);

const RoomModels: React.FC = () => {
  const roomGltf = useGLTF(ROOM_MODEL_URL);
  const couchGirlGltf = useGLTF(GIRL_ON_COUCH_URL);
  const beautyGirlGltf = useGLTF(BEAUTY_GIRL_URL);

  const roomScene = useMemo(() => roomGltf.scene.clone(true), [roomGltf.scene]);
  const girlOnCouch = useMemo(() => couchGirlGltf.scene.clone(true), [couchGirlGltf.scene]);
  const beautyGirl = useMemo(() => beautyGirlGltf.scene.clone(true), [beautyGirlGltf.scene]);

  useEffect(() => {
    const targetHeight = 1.6;
    fitToHeight(girlOnCouch, targetHeight);
    fitToHeight(beautyGirl, targetHeight);
    placeOnFloor(girlOnCouch);
    placeOnFloor(beautyGirl);

    girlOnCouch.position.set(-1.2, 0, 0.8);
    girlOnCouch.rotation.y = Math.PI / 2;

    beautyGirl.position.set(1.6, 0.8, -1.2);
    beautyGirl.rotation.y = -Math.PI * 0.3 / 2;
  }, [girlOnCouch, beautyGirl]);

  return (
    <>
      <primitive object={roomScene} />
      <primitive object={girlOnCouch} />
      <primitive object={beautyGirl} />
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

export const ChatRoom3D: React.FC<ChatRoom3DProps> = () => {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
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
          <RoomModels />
        </Suspense>
      </Canvas>
    </div>
  );
};

useGLTF.preload(ROOM_MODEL_URL);
useGLTF.preload(GIRL_ON_COUCH_URL);
useGLTF.preload(BEAUTY_GIRL_URL);
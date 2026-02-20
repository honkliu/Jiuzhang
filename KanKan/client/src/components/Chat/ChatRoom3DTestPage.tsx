import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { GroupProps } from '@react-three/fiber';
import { Html, SoftShadows, CameraControls, useGLTF } from '@react-three/drei';
import type CameraControlsImpl from 'camera-controls';
import * as THREE from 'three';
import avatarUrl from '../../assets/zodiac/avatar.glb?url';
import { useLanguage } from '@/i18n/LanguageContext';

// Model source (CC-BY 4.0): https://sketchfab.com/3d-models/room-6417cbc1870a4a1691cca06912ae0369
type MeshNode = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
type RoomGLTFResult = {
  nodes: Record<string, MeshNode>;
  materials: Record<string, THREE.Material>;
};

function RoomModel(props: GroupProps) {
  const { nodes, materials } = useGLTF('/room-transformed.glb') as unknown as RoomGLTFResult;
  return (
    <group {...props} dispose={null}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh castShadow receiveShadow geometry={nodes.Object_2.geometry} material={materials.Material} />
        <mesh castShadow receiveShadow geometry={nodes.Object_3.geometry} material={materials['Material.002']} />
        <mesh castShadow receiveShadow geometry={nodes.Object_4.geometry} material={materials['Material.003']} />
        <ChairWithAvatar chair={nodes.Object_6} material={materials.krzeslo_1} />
        <mesh castShadow receiveShadow geometry={nodes.Object_7.geometry} material={materials.krzeslo_okno} />
        <mesh castShadow receiveShadow geometry={nodes.Object_8.geometry} material={materials.krzeslo_prawe} />
        <mesh castShadow receiveShadow geometry={nodes.Object_9.geometry} material={materials.krzeslo_srodek} />
        <mesh castShadow receiveShadow geometry={nodes.Object_10.geometry} material={materials.podloga} />
        <mesh castShadow receiveShadow geometry={nodes.Object_11.geometry} material={materials.sciana_okno} />
        <mesh castShadow receiveShadow geometry={nodes.Object_12.geometry} material={materials['stolik.001']} />
        <mesh castShadow receiveShadow geometry={nodes.Object_16.geometry} material={materials['Material.006']} />
        <mesh castShadow receiveShadow geometry={nodes.Object_5.geometry} material={materials['Material.004']} />
        <mesh geometry={nodes.Object_13.geometry}>
          <meshStandardMaterial transparent opacity={0.5} />
        </mesh>
        <mesh castShadow receiveShadow geometry={nodes.Object_14.geometry} material={materials['Material.002']} />
        <mesh castShadow receiveShadow geometry={nodes.Object_15.geometry} material={materials['Material.005']} />
        <mesh castShadow receiveShadow geometry={nodes.Object_17.geometry} material={materials.mata} />
        <mesh castShadow receiveShadow geometry={nodes.Object_18.geometry} material={materials.stolik} />
      </group>
    </group>
  );
}

useGLTF.preload('/room-transformed.glb');

// Avatar model source: local asset
interface AvatarModelProps {
  scale?: number;
  rotation?: [number, number, number];
}

function AvatarModel({ scale = 0.12, rotation = [0, Math.PI, 0] }: AvatarModelProps) {
  const { scene } = useGLTF(avatarUrl) as unknown as { scene: THREE.Group };
  const avatar = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

  return <primitive object={avatar} scale={scale} rotation={rotation} />;
}

useGLTF.preload(avatarUrl);

interface ChairWithAvatarProps {
  chair: MeshNode;
  material: THREE.Material;
}

function ChairWithAvatar({ chair, material }: ChairWithAvatarProps) {
  const avatarRef = useRef<THREE.Group | null>(null);
  const seatY = useMemo(() => {
    const geom = chair.geometry;
    if (!geom.boundingBox) {
      geom.computeBoundingBox();
    }
    return geom.boundingBox ? geom.boundingBox.max.y : 0.3;
  }, [chair]);
  const avatarScale = 0.08;

  useLayoutEffect(() => {
    if (!avatarRef.current) return;
    const box = new THREE.Box3().setFromObject(avatarRef.current);
    const min = box.min.clone();
    const yOffset = -min.y;
    avatarRef.current.position.set(0, seatY + yOffset + 0.01, 0);
  }, [seatY]);

  return (
    <group position={chair.position} rotation={chair.rotation} scale={chair.scale}>
      <mesh castShadow receiveShadow geometry={chair.geometry} material={material} />
      <Suspense fallback={null}>
        <group ref={avatarRef} rotation={[0, Math.PI, 0]}>
          <AvatarModel scale={avatarScale} />
        </group>
      </Suspense>
    </group>
  );
}

function Loading() {
  const { t } = useLanguage();
  return (
    <Html center style={{ color: '#ffffff', fontSize: '14px' }}>
      {t('common.loading')}
    </Html>
  );
}

function damp(current: number, target: number, lambda: number, delta: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * delta));
}

function LightRig() {
  const ref = useRef<THREE.Group | null>(null);

  useFrame((state, delta) => {
    if (!ref.current) return;
    const targetX = (state.pointer.y * Math.PI) / 50;
    const targetY = (state.pointer.x * Math.PI) / 20;
    ref.current.rotation.x = damp(ref.current.rotation.x, targetX, 4, delta);
    ref.current.rotation.y = damp(ref.current.rotation.y, targetY, 4, delta);
  });

  return (
    <group ref={ref}>
      <directionalLight
        position={[5, 5, -8]}
        castShadow
        intensity={4}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.001}
      >
        <orthographicCamera attach="shadow-camera" args={[-8.5, 8.5, 8.5, -8.5, 0.1, 20]} />
      </directionalLight>
    </group>
  );
}

function CozyBar() {
  const controlsRef = useRef<CameraControlsImpl | null>(null);

  useEffect(() => {
    if (!controlsRef.current) return;
    controlsRef.current.setLookAt(0, 1.4, 5.5, 0, 0.8, 0, true);
  }, []);

  return (
    <Canvas
      shadows
      dpr={[1, 1.25]}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      camera={{ position: [0, 1.4, 5.5], fov: 50, near: 0.1, far: 60 }}
      style={{ width: '100vw', height: '100vh', display: 'block' }}
    >
      <SoftShadows size={25} focus={0.4} samples={8} />
      <CameraControls
        ref={controlsRef}
        makeDefault
        minPolarAngle={Math.PI / 2}
        maxPolarAngle={Math.PI / 2}
        minAzimuthAngle={-Math.PI / 3}
        maxAzimuthAngle={Math.PI / 3}
        minDistance={5.5}
        maxDistance={5.5}
        truckSpeed={0}
        dollySpeed={0}
      />
      <color attach="background" args={['#d0d0d0']} />
      <fog attach="fog" args={['#d0d0d0', 8, 35]} />

      <ambientLight intensity={0.4} />
      <LightRig />

      <Suspense fallback={<Loading />}>
        <RoomModel scale={0.5} position={[0, -1, 0]} />
      </Suspense>
    </Canvas>
  );
}

export const ChatRoom3DTestPage = CozyBar;
export default CozyBar;

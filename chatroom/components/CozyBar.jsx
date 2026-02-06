import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { TextureLoader } from 'three';

// 自定义 Hook：加载纹理（缺失时自动回退）
const hexToRgb = (hex) => {
  const sanitized = hex.replace('#', '');
  const value = sanitized.length === 3
    ? sanitized.split('').map((c) => c + c).join('')
    : sanitized.padEnd(6, '0');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return [r, g, b];
};

const createFallbackTexture = (color) => {
  const [r, g, b] = hexToRgb(color);
  const data = new Uint8Array([r, g, b, 255]);
  const texture = new THREE.DataTexture(data, 1, 1);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const useSafeTexture = (url, fallbackColor) => {
  const fallback = useMemo(() => createFallbackTexture(fallbackColor), [fallbackColor]);
  const [texture, setTexture] = useState(fallback);

  useEffect(() => {
    if (!url) return;
    let isMounted = true;
    const loader = new TextureLoader();
    loader.load(
      url,
      (loaded) => {
        if (!isMounted) return;
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.wrapS = THREE.RepeatWrapping;
        loaded.wrapT = THREE.RepeatWrapping;
        setTexture(loaded);
      },
      undefined,
      () => {
        // keep fallback
      }
    );
    return () => {
      isMounted = false;
    };
  }, [url, fallback]);

  return texture;
};

// 简单人物模型（用圆柱+球体模拟）
const Person = ({ position, rotation = [0, 0, 0] }) => {
  const torso = useRef();
  const head = useRef();

  useFrame(() => {
    // 轻微呼吸感
    if (torso.current) {
      torso.current.rotation.x = Math.sin(Date.now() * 0.0005) * 0.02;
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* 身体 */}
      <mesh ref={torso} position={[0, 0.6, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.1, 0.4, 8]} />
        <meshStandardMaterial color="#3a2e26" roughness={0.7} metalness={0.1} />
      </mesh>

      {/* 头 */}
      <mesh ref={head} position={[0, 1.05, 0]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color="#e6ccb3" roughness={0.6} metalness={0.05} />
      </mesh>

      {/* 手臂（简化） */}
      <mesh position={[0.18, 0.8, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.2, 6]} />
        <meshStandardMaterial color="#3a2e26" />
      </mesh>
      <mesh position={[-0.18, 0.8, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.2, 6]} />
        <meshStandardMaterial color="#3a2e26" />
      </mesh>
    </group>
  );
};

// 酒杯（热红酒）
const WineGlass = ({ position, isHot = false }) => {
  const glassRef = useRef();
  const liquidRef = useRef();

  useFrame(() => {
    if (liquidRef.current) {
      liquidRef.current.scale.y = 0.8 + Math.sin(Date.now() * 0.001) * 0.02;
    }
  });

  return (
    <group position={position}>
      {/* 玻璃杯 */}
      <mesh ref={glassRef} position={[0, 0.05, 0]} rotation={[0, 0, 0]}>
        <coneGeometry args={[0.035, 0.1, 16, 1]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transmission={0.9}
          roughness={0.05}
          metalness={0.1}
          thickness={0.005}
          ior={1.5}
          clearcoat={1}
          clearcoatRoughness={0.1}
        />
      </mesh>

      {/* 液体 */}
      <mesh ref={liquidRef} position={[0, 0.03, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.07, 16]} />
        <meshPhysicalMaterial
          color="#8b0000"
          transmission={0.8}
          roughness={0.1}
          metalness={0.0}
          thickness={0.008}
          ior={1.33}
        />
      </mesh>

      {/* 橙皮 */}
      <mesh position={[0.04, 0.11, 0]} rotation={[0, 0, 0.3]}>
        <planeGeometry args={[0.03, 0.02]} />
        <meshStandardMaterial color="#c96d1a" side={THREE.DoubleSide} />
      </mesh>

      {/* 肉桂棒 */}
      <mesh position={[-0.02, 0.12, 0]} rotation={[0, 0, 0.2]}>
        <cylinderGeometry args={[0.003, 0.003, 0.08, 8]} />
        <meshStandardMaterial color="#5d3a1a" />
      </mesh>
    </group>
  );
};

// 威士忌杯
const WhiskeyGlass = ({ position }) => {
  return (
    <group position={position}>
      {/* 玻璃杯 */}
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.04, 0.03, 0.08, 16]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transmission={0.85}
          roughness={0.05}
          metalness={0.1}
          thickness={0.005}
          ior={1.5}
          clearcoat={1}
          clearcoatRoughness={0.1}
        />
      </mesh>

      {/* 冰块 */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.02, 0.02, 0.02]} />
        <meshPhysicalMaterial
          color="#e0f7ff"
          transmission={0.9}
          roughness={0.1}
          metalness={0.0}
          thickness={0.008}
          ior={1.31}
          clearcoat={0.8}
          clearcoatRoughness={0.05}
        />
      </mesh>

      {/* 水痕（贴图模拟） */}
      <mesh position={[0, 0.025, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.08, 0.005]} />
        <meshStandardMaterial
          color="#333333"
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
};

// 雪茄
const Cigar = ({ position }) => {
  return (
    <group position={position}>
      {/* 雪茄主体 */}
      <mesh position={[0, 0.005, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.06, 12]} />
        <meshStandardMaterial color="#3a2414" roughness={0.7} />
      </mesh>

      {/* 烟灰 */}
      <mesh position={[0.04, 0.008, 0]}>
        <sphereGeometry args={[0.005, 8, 8]} />
        <meshStandardMaterial color="#cccccc" roughness={0.8} />
      </mesh>

      {/* 余烬（发光） */}
      <pointLight
        position={[0.045, 0.008, 0]}
        intensity={0.8}
        color="#ff6b00"
        distance={0.1}
      />
    </group>
  );
};

// 铜制小桌
const BrassTable = ({ position }) => {
  const brassTexture = useSafeTexture('/textures/brass_rough.jpg', '#b08d57');

  return (
    <group position={position}>
      {/* 桌面 */}
      <mesh position={[0, 0.21, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.19, 16]} />
        <meshStandardMaterial
          map={brassTexture}
          roughness={0.8}
          metalness={0.9}
          displacementScale={0.02}
        />
      </mesh>

      {/* 三足支架 */}
      {[0, 2, 4].map((i) => {
        const angle = (i / 3) * Math.PI * 2;
        const x = Math.cos(angle) * 0.15;
        const z = Math.sin(angle) * 0.15;
        return (
          <mesh key={i} position={[x, 0.1, z]} rotation={[0, 0, 0]}>
            <cylinderGeometry args={[0.008, 0.006, 0.1, 8]} />
            <meshStandardMaterial
              map={brassTexture}
              roughness={0.3}
              metalness={0.95}
            />
          </mesh>
        );
      })}
    </group>
  );
};

// 酒吧椅
const BarStool = ({ position, rotation = [0, 0, 0] }) => {
  const leatherTexture = useSafeTexture('/textures/leather_dark.jpg', '#3a2e26');
  const brassTexture = useSafeTexture('/textures/brass_rough.jpg', '#b08d57');

  return (
    <group position={position} rotation={rotation}>
      {/* 座面 */}
      <mesh position={[0, 0.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.18, 16]} />
        <meshStandardMaterial
          map={leatherTexture}
          roughness={0.7}
          metalness={0.05}
          displacementScale={0.03}
        />
      </mesh>

      {/* 支柱 */}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.3, 8]} />
        <meshStandardMaterial color="#2d221c" />
      </mesh>

      {/* 铜制扶手 */}
      <mesh position={[0.15, 0.65, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.015, 0.015, 0.08, 8]} />
        <meshStandardMaterial
          map={brassTexture}
          roughness={0.2}
          metalness={0.9}
        />
      </mesh>
      <mesh position={[-0.15, 0.65, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.015, 0.015, 0.08, 8]} />
        <meshStandardMaterial
          map={brassTexture}
          roughness={0.2}
          metalness={0.9}
        />
      </mesh>

      {/* 铸铁腿 */}
      {[0, 1, 2].map((i) => {
        const angle = (i / 3) * Math.PI * 2;
        const x = Math.cos(angle) * 0.14;
        const z = Math.sin(angle) * 0.14;
        return (
          <mesh key={i} position={[x, 0.1, z]} rotation={[0, 0, 0]}>
            <cylinderGeometry args={[0.018, 0.022, 0.1, 8]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.6} />
          </mesh>
        );
      })}
    </group>
  );
};

// 吧台
const BarCounter = ({ position }) => {
  const woodTexture = useSafeTexture('/textures/wood_dark.jpg', '#5a3a2a');

  return (
    <group position={position}>
      {/* 台面 */}
      <mesh position={[0, 0.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.5, 0.7]} />
        <meshStandardMaterial
          map={woodTexture}
          roughness={0.6}
          metalness={0.1}
          displacementScale={0.04}
        />
      </mesh>

      {/* 台面边缘（圆角） */}
      <mesh position={[0, 0.57, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.5, 0.05]} />
        <meshStandardMaterial
          map={woodTexture}
          roughness={0.7}
          metalness={0.05}
        />
      </mesh>

      {/* 吧台侧板 */}
      <mesh position={[0, 0.275, 0.35]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.5, 0.55]} />
        <meshStandardMaterial
          map={woodTexture}
          roughness={0.6}
          metalness={0.1}
        />
      </mesh>

      {/* 吧台下灯带（模拟） */}
      <pointLight
        position={[0, 0.07, 0]}
        intensity={0.3}
        color="#e6a86d"
        distance={1}
      />
    </group>
  );
};

// 墙壁
const Wall = ({ position, rotation, size, color, textureUrl = null }) => {
  const wallTexture = useSafeTexture(textureUrl || '/textures/brick_red.jpg', '#6b3a2a');

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={size} />
      <meshStandardMaterial
        map={wallTexture}
        roughness={0.8}
        metalness={0.1}
        displacementScale={0.05}
      />
    </mesh>
  );
};

// 窗户（带雪）
const Window = ({ position }) => {
  const snowTexture = useSafeTexture('/textures/snowflake.png', '#ffffff');

  // 雪粒子系统
  const Snowflake = ({ index }) => {
    const ref = useRef();
    const [x, y] = [Math.random() * 2 - 1, Math.random() * 3 - 1.5];

    useFrame(() => {
      if (ref.current) {
        ref.current.position.y += 0.001;
        ref.current.position.x += Math.sin(Date.now() * 0.0001 + index) * 0.0005;
        if (ref.current.position.y > 1.5) {
          ref.current.position.y = -1.5;
        }
      }
    });

    return (
      <mesh ref={ref} position={[x, y, 0.01]}>
        <planeGeometry args={[0.01, 0.01]} />
        <meshStandardMaterial
          map={snowTexture}
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>
    );
  };

  return (
    <group position={position}>
      {/* 窗框 */}
      <mesh position={[0, 0.9, -0.01]} rotation={[0, 0, 0]}>
        <boxGeometry args={[1.2, 1.8, 0.02]} />
        <meshStandardMaterial color="#4a2c12" roughness={0.9} metalness={0.8} />
      </mesh>

      {/* 玻璃 */}
      <mesh position={[0, 0.9, -0.005]} rotation={[0, 0, 0]}>
        <boxGeometry args={[1.18, 1.78, 0.01]} />
        <meshPhysicalMaterial
          color="#e0f7ff"
          transmission={0.7}
          roughness={0.1}
          metalness={0.0}
          ior={1.5}
          clearcoat={0.5}
          clearcoatRoughness={0.2}
        />
      </mesh>

      {/* 雪花粒子 */}
      {[...Array(40)].map((_, i) => (
        <Snowflake key={i} index={i} />
      ))}

      {/* 窗台 */}
      <mesh position={[0, 1.8, -0.02]} rotation={[0, 0, 0]}>
        <boxGeometry args={[1.2, 0.15, 0.03]} />
        <meshStandardMaterial color="#3a2e26" roughness={0.8} />
      </mesh>

      {/* 常春藤（简化） */}
      <mesh position={[0.5, 1.7, -0.01]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.002, 0.002, 0.1, 6]} />
        <meshStandardMaterial color="#2d4a2d" />
      </mesh>
    </group>
  );
};

// 灯光
const Lights = () => {
  return (
    <>
      {/* 环境光（基础） */}
      <ambientLight intensity={0.15} />

      {/* 吊灯（暖光） */}
      <pointLight
        position={[2.6, 2.2, 1.5]}
        intensity={0.6}
        color="#e6a86d"
        distance={3}
        decay={2}
      />

      {/* 台灯（铜灯） */}
      <pointLight
        position={[4.8, 1.8, 1.4]}
        intensity={0.4}
        color="#d4a16e"
        distance={2}
        decay={2}
      />

      {/* 窗外冷光（月光） */}
      <directionalLight
        position={[5, 3, -5]}
        intensity={0.08}
        color="#c0e0ff"
        castShadow
        shadowMapSize={1024}
      />
    </>
  );
};

// 主场景
export default function CozyBar() {
  return (
    <Canvas
      shadows
      gl={{ antialias: true }}
      camera={{ position: [1.8, 1.4, 3.2], fov: 50 }}
      style={{ background: '#0a0a12', height: '100vh', width: '100vw' }}
    >
      <Lights />

      {/* 环境光照贴图（模拟房间反射） */}
      <Environment preset="sunset" />

      {/* 地面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[5.2, 3.8]} />
        <meshStandardMaterial
          color="#4a3a2d"
          roughness={0.8}
          metalness={0.1}
          displacementScale={0.03}
        />
      </mesh>

      {/* 墙壁 */}
      <Wall position={[0, 1.55, -1.9]} rotation={[0, 0, 0]} size={[5.2, 3.1]} />
      <Wall position={[0, 1.55, 1.9]} rotation={[0, 0, 0]} size={[5.2, 3.1]} />
      <Wall
        position={[2.6, 1.55, 0]}
        rotation={[0, Math.PI / 2, 0]}
        size={[3.8, 3.1]}
        textureUrl="/textures/brick_red.jpg"
      />
      <Wall
        position={[-2.6, 1.55, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        size={[3.8, 3.1]}
        textureUrl="/textures/brick_red.jpg"
      />

      {/* 天花板 */}
      <Wall
        position={[0, 3.1, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        size={[5.2, 3.8]}
        color="#3a3a3a"
      />

      {/* 吧台 */}
      <BarCounter position={[0, 0.55, 1.8]} />

      {/* 椅子 */}
      <BarStool position={[-0.6, 0.6, 0.8]} rotation={[0, Math.PI / 4, 0]} />
      <BarStool position={[0.6, 0.6, 0.8]} rotation={[0, -Math.PI / 4, 0]} />

      {/* 人物 */}
      <Person position={[-0.6, 1.2, 0.8]} rotation={[0, Math.PI / 4, 0]} />
      <Person position={[0.6, 1.2, 0.8]} rotation={[0, -Math.PI / 4, 0]} />

      {/* 小桌 */}
      <BrassTable position={[0, 0.42, 0.8]} />

      {/* 酒杯 */}
      <WineGlass position={[-0.3, 0.6, 0.8]} isHot={true} />
      <WhiskeyGlass position={[0.3, 0.6, 0.8]} />

      {/* 雪茄 */}
      <Cigar position={[0, 0.65, 0.8]} />

      {/* 窗户 */}
      <Window position={[0, 0.9, -1.9]} />

      {/* 阴影 */}
      <ContactShadows
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        opacity={0.6}
        width={10}
        height={10}
        blur={1}
        far={5}
      />

      {/* 控制器（可选） */}
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        maxPolarAngle={Math.PI / 2}
        minPolarAngle={Math.PI / 4}
        dampingFactor={0.05}
      />
    </Canvas>
  );
}
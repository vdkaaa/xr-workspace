/**
 * DGO-08: RoomScene
 *
 * Escena Three.js base integrada en web-client via React Three Fiber.
 * - Sala 3D minimalista (suelo, paredes, techo)
 * - OrbitControls para desktop
 * - Avatares como esferas por cada usuario en Liveblocks presence
 */

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useOthersMapped, useSelf } from "../../lib/liveblocks";

// ─── Main export ──────────────────────────────────────────────────────────────
export function RoomScene() {
  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{ position: [0, 3, 8], fov: 60 }}
        style={{ background: "#080b14" }}
        shadows
      >
        <SceneContent />
      </Canvas>

      {/* HUD overlay */}
      <div className="absolute bottom-4 left-4 font-mono text-[10px] text-gray-600 pointer-events-none">
        <p>click + drag — rotate · scroll — zoom · right click — pan</p>
      </div>
    </div>
  );
}

// ─── Scene content ────────────────────────────────────────────────────────────
function SceneContent() {
  return (
    <>
      {/* Iluminación */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 5]} intensity={1.5} castShadow />
      <pointLight position={[0, 5, 0]} intensity={1} color="#60a5fa" />

      {/* Sala */}
      <RoomGeometry />

      {/* Avatares */}
      <ConnectedAvatars />

      {/* Controles */}
      <OrbitControls
        makeDefault
        minDistance={2}
        maxDistance={20}
        maxPolarAngle={Math.PI / 2 - 0.05}
        target={[0, 1, 0]}
      />
    </>
  );
}

// ─── Room Geometry ────────────────────────────────────────────────────────────
function RoomGeometry() {
  return (
    <group>
      {/* Suelo */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[16, 12]} />
        <meshStandardMaterial color="#0a0f1e" roughness={0.9} />
      </mesh>

      {/* Pared trasera */}
      <mesh position={[0, 3, -6]}>
        <planeGeometry args={[16, 6]} />
        <meshStandardMaterial color="#0f172a" roughness={0.8} />
      </mesh>

      {/* Pared izquierda */}
      <mesh position={[-8, 3, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[12, 6]} />
        <meshStandardMaterial color="#0f172a" roughness={0.8} />
      </mesh>

      {/* Pared derecha */}
      <mesh position={[8, 3, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[12, 6]} />
        <meshStandardMaterial color="#0f172a" roughness={0.8} />
      </mesh>

      {/* Techo */}
      <mesh position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[16, 12]} />
        <meshStandardMaterial color="#060a14" roughness={1} />
      </mesh>

      {/* Panel de luz en techo */}
      <mesh position={[0, 5.9, 0]}>
        <planeGeometry args={[3, 2]} />
        <meshStandardMaterial
          color="#60a5fa"
          emissive="#60a5fa"
          emissiveIntensity={0.6}
        />
      </mesh>

      {/* Box de referencia en el centro */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#1e3a5f" roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}

// ─── Connected Avatars ────────────────────────────────────────────────────────
function ConnectedAvatars() {
  const others = useOthersMapped((other) => ({
    displayName: other.presence.displayName,
    status: other.presence.status,
  }));

  const self = useSelf();
  const total = others.length + 1;
  const positions = getCirclePositions(total, 3);

  return (
    <group>
      {self && (
        <AvatarSphere
          position={positions[0]}
          color="#34d399"
        />
      )}
      {others.map(([connectionId], i) => (
        <AvatarSphere
          key={connectionId}
          position={positions[i + 1]}
          color="#60a5fa"
        />
      ))}
    </group>
  );
}

// ─── Avatar Sphere ────────────────────────────────────────────────────────────
function AvatarSphere({
  position,
  color,
}: {
  position: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position} castShadow>
      <sphereGeometry args={[0.4, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.4}
        roughness={0.3}
        metalness={0.4}
      />
    </mesh>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function getCirclePositions(count: number, radius: number): [number, number, number][] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(angle) * radius, 0.4, Math.sin(angle) * radius];
  });
}
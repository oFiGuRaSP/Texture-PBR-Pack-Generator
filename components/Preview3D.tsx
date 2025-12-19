import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { TextureSet } from '../types';

interface Preview3DProps {
  textures: TextureSet | null;
  autoRotate: boolean;
  displacementScale: number;
}

const MaterialMesh: React.FC<{ textures: TextureSet; autoRotate: boolean; displacementScale: number }> = ({ 
  textures, 
  autoRotate,
  displacementScale 
}) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (autoRotate && meshRef.current) {
      meshRef.current.rotation.y += delta * 0.3; // Slower rotation for better inspection
    }
  });
  
  const maps = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const load = (url: string) => {
      const tex = loader.load(url);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 16; // Improve texture quality at angles
      return tex;
    };
    
    const albedo = load(textures.albedo);
    albedo.encoding = THREE.sRGBEncoding;

    return {
      map: albedo,
      normalMap: load(textures.normal),
      roughnessMap: load(textures.roughness),
      metalnessMap: load(textures.metallic),
      displacementMap: load(textures.height),
      aoMap: load(textures.ao),
    };
  }, [textures]);

  // Normalize the slider value (0-5) to a reasonable Three.js world unit (0.0 - 0.15)
  const visualDisplacement = displacementScale * 0.03;

  return (
    <Sphere ref={meshRef} args={[1, 256, 256]}> 
      {/* Increased segments (256) for smoother displacement */}
      <meshStandardMaterial
        color={0xffffff}
        map={maps.map}
        normalMap={maps.normalMap}
        roughnessMap={maps.roughnessMap}
        metalnessMap={maps.metalnessMap}
        displacementMap={maps.displacementMap}
        displacementScale={visualDisplacement} 
        displacementBias={-visualDisplacement / 2} // Keeps the geometry centered
        aoMap={maps.aoMap}
        aoMapIntensity={1.0}
        roughness={1.0} 
        metalness={1.0} 
        normalScale={new THREE.Vector2(1, 1)}
      />
    </Sphere>
  );
};

const Preview3D: React.FC<Preview3DProps> = ({ textures, autoRotate, displacementScale }) => {
  return (
    <div className="w-full h-full bg-slate-100 dark:bg-slate-900 rounded-xl overflow-hidden shadow-inner relative transition-colors duration-300">
       {!textures && (
         <div className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-500 z-10">
           <p><i className="fa-solid fa-cube mr-2"></i> Preview 3D (Arraste para girar)</p>
         </div>
       )}
      <Canvas camera={{ position: [0, 0, 3.0], fov: 40 }} shadows>
        {/* Improved Lighting Setup for PBR */}
        <ambientLight intensity={0.5} color={0xffffff} />
        <directionalLight 
          position={[5, 5, 5]} 
          intensity={1.5} 
          castShadow 
          shadow-mapSize={[1024, 1024]} 
        />
        <pointLight position={[-3, -3, -3]} intensity={0.5} />
        
        {/* Subtle Environment reflection for metallic parts */}
        <Environment preset="city" />

        {textures && (
          <MaterialMesh 
            textures={textures} 
            autoRotate={autoRotate} 
            displacementScale={displacementScale}
          />
        )}
        <OrbitControls enablePan={false} minDistance={1.5} maxDistance={6} />
      </Canvas>
    </div>
  );
};

export default Preview3D;
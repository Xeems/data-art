import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface AudioSphereProps {
  analyser: AnalyserNode | null;
}

export default function AudioSphere({ analyser }: AudioSphereProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const dataArray = useRef<Uint8Array | null>(null);
  
  const baseSphereRadius = 18;
  const totalPoints = 8000;

  // Алгоритм Фибоначчи для идеально равноудаленных точек
  const [positions, initialDirections] = useMemo(() => {
    const pos = new Float32Array(totalPoints * 3);
    const dirs = new Float32Array(totalPoints * 3);
    const vector = new THREE.Vector3();
    const phi = Math.PI * (3.0 - Math.sqrt(5.0)); 

    for (let i = 0; i < totalPoints; i++) {
      const y = 1.0 - (i / (totalPoints - 1.0)) * 2.0; 
      const radiusAtY = Math.sqrt(1.0 - y * y); 
      const theta = phi * i; 

      const x = Math.cos(theta) * radiusAtY;
      const z = Math.sin(theta) * radiusAtY;

      vector.set(x, y, z).normalize();

      dirs[i * 3] = vector.x;
      dirs[i * 3 + 1] = vector.y;
      dirs[i * 3 + 2] = vector.z;

      pos[i * 3] = vector.x * baseSphereRadius;
      pos[i * 3 + 1] = vector.y * baseSphereRadius;
      pos[i * 3 + 2] = vector.z * baseSphereRadius;
    }

    return [pos, dirs];
  }, []);

  const sharpCircleTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.arc(8, 8, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    return new THREE.CanvasTexture(canvas);
  }, []);

  useEffect(() => {
    if (analyser) {
      analyser.smoothingTimeConstant = 0.45;
    }
  }, [analyser]);

  useFrame((state) => {
    if (!analyser || !pointsRef.current) return;

    if (!dataArray.current) {
      dataArray.current = new Uint8Array(analyser.frequencyBinCount);
    }

    analyser.getByteFrequencyData(dataArray.current);

    const geometry = pointsRef.current.geometry as THREE.BufferGeometry;
    const positionAttribute = geometry.attributes.position as THREE.BufferAttribute;
    
    let colorAttribute = geometry.attributes.color as THREE.BufferAttribute;
    if (!colorAttribute) {
      const colors = new Float32Array(totalPoints * 3);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      colorAttribute = geometry.attributes.color as THREE.BufferAttribute;
    }

    const time = state.clock.getElapsedTime();
    const vertex = new THREE.Vector3();
    const totalBins = dataArray.current.length;

    const tempColor = new THREE.Color();

    let totalEnergy = 0;
    for (let k = 0; k < totalBins; k++) {
      totalEnergy += dataArray.current[k];
    }
    const globalVolume = totalEnergy / totalBins / 255;

    const bassBins = dataArray.current.slice(0, 8);
    const bassNormalized = bassBins.reduce((sum, val) => sum + val, 0) / bassBins.length / 255;
    const bassTrigger = Math.pow(bassNormalized, 1.1);

    for (let i = 0; i < totalPoints; i++) {
      const dirX = initialDirections[i * 3];
      const dirY = initialDirections[i * 3 + 1];
      const dirZ = initialDirections[i * 3 + 2];
      
      const direction = vertex.set(dirX, dirY, dirZ).normalize();

      const n1 = Math.sin(direction.x * 5.0 + time * 1.2) * Math.cos(direction.y * 5.0 - time * 0.8);
      const n2 = Math.sin(direction.z * 7.0 - time * 1.5) * Math.cos(direction.x * 7.0 + time * 1.0);
      const noiseValue = n1 * 0.6 + n2 * 0.4;

      const positionFactor = Math.abs(direction.y);
      let sampleIndex = Math.floor(positionFactor * (totalBins - 1));
      sampleIndex = (sampleIndex + Math.floor(Math.abs(noiseValue) * 30)) % totalBins;
      
      let audioValue = dataArray.current[sampleIndex] / 255;

      if (positionFactor < 0.3) {
        audioValue *= 1.4;
      }

      const displacement = baseSphereRadius + 
                           (noiseValue * 2.5) + 
                           (audioValue * 12.0) * (noiseValue + 0.8) + 
                           (bassTrigger * 4.5) * (positionFactor < 0.4 ? 1.0 : 0.3) + 
                           (globalVolume * 3.0);
      
      vertex.copy(direction).multiplyScalar(displacement);
      positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);

      // В тишине — блеклый белый (0.28)
      const defaultBrightness = 0.28;
      let r = defaultBrightness;
      let g = defaultBrightness;
      let b = defaultBrightness;

      if (audioValue > 0.04) {
        // ЛОГИКА ГРАДИЕНТА:
        // Вычисляем фактор высоты (heightFactor) конкретной точки внутри волны.
        // Он равен 0 у основания (в низине рельефа) и стремится к 1 на самой вершине пика.
        const heightFactor = Math.max(0, Math.min(1, (noiseValue + 1.0) * 0.3 + audioValue * 0.4));

        // Градиент для средних/высоких частот (основное тело сферы)
        // Основание волны (heightFactor -> 0): Глубокий неоново-синий
        // Вершина волны (heightFactor -> 1): Ослепительный бирюзово-зеленый
        let startHue = 0.65; // Синий
        let endHue = 0.45;   // Бирюзово-зеленый
        
        // Плавно интерполируем оттенок от основания к вершине
        let hue = THREE.MathUtils.lerp(startHue, endHue, heightFactor);
        let lightness = 0.3 + heightFactor * 0.3;

        // Отдельный градиент для басовых взрывов на экваторе
        // Если играет тяжелый бас, то у основания волна будет фиолетовой, а на самом пике — ярко-розовой
        if (positionFactor < 0.35 && bassTrigger > 0.2) {
          startHue = 0.76; // Фиолетовый (основание)
          endHue = 0.92;   // Ярко-розовый (вершина)
          hue = THREE.MathUtils.lerp(startHue, endHue, heightFactor);
          lightness = 0.35 + heightFactor * 0.4;
        }

        tempColor.setHSL(hue, 1.0, lightness);
        r = tempColor.r;
        g = tempColor.g;
        b = tempColor.b;
      }

      colorAttribute.setXYZ(i, r, g, b);
    }

    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
  });

  return (
    <>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={totalPoints}
            array={positions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial 
          size={0.18} 
          sizeAttenuation={true}
          transparent={true} 
          opacity={0.9}      
          vertexColors={true}
          map={sharpCircleTexture}
          depthWrite={false}        
          blending={THREE.NormalBlending} 
        />
      </points>
      <OrbitControls enableDamping dampingFactor={0.05} />
    </>
  );
}

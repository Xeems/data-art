import  { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface AudioSphereProps {
  analyser: AnalyserNode | null;
}

export default function SphereV1({ analyser }: AudioSphereProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const dataArray = useRef<Uint8Array | null>(null);
  const initialPositions = useRef<Float32Array | null>(null);
  const baseSphereRadius = 18;

  useEffect(() => {
    if (pointsRef.current) {
      const geometry = pointsRef.current.geometry as THREE.BufferGeometry;
      const positionAttribute = geometry.attributes.position as THREE.BufferAttribute;
      initialPositions.current = positionAttribute.array.slice() as Float32Array;
    }
  }, []);

  useFrame((state) => {
    if (!analyser || !pointsRef.current || !initialPositions.current) return;

    if (!dataArray.current) {
      dataArray.current = new Uint8Array(analyser.frequencyBinCount);
    }

    analyser.getByteFrequencyData(dataArray.current);

    const geometry = pointsRef.current.geometry as THREE.BufferGeometry;
    const positionAttribute = geometry.attributes.position as THREE.BufferAttribute;
    
    let colorAttribute = geometry.attributes.color as THREE.BufferAttribute;
    if (!colorAttribute) {
      const colors = new Float32Array(positionAttribute.count * 3);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      colorAttribute = geometry.attributes.color as THREE.BufferAttribute;
    }

    const time = state.clock.getElapsedTime();
    const vertex = new THREE.Vector3();
    const totalBins = dataArray.current.length;

    // Считаем общую энергию трека для глобальных эффектов
    let totalEnergy = 0;
    for (let k = 0; k < totalBins; k++) {
      totalEnergy += dataArray.current[k];
    }
    const globalVolume = totalEnergy / totalBins / 255;

    for (let i = 0; i < positionAttribute.count; i++) {
      const origX = initialPositions.current[i * 3];
      const origY = initialPositions.current[i * 3 + 1];
      const origZ = initialPositions.current[i * 3 + 2];
      
      vertex.set(origX, origY, origZ);
      const direction = vertex.clone().normalize();

      // 1. УЛУЧШЕННЫЙ ТРЕХМЕРНЫЙ ШУМ
      const n1 = Math.sin(direction.x * 5.0 + time * 1.2) * Math.cos(direction.y * 5.0 - time * 0.8);
      const n2 = Math.sin(direction.z * 7.0 - time * 1.5) * Math.cos(direction.x * 7.0 + time * 1.0);
      const noiseValue = n1 * 0.6 + n2 * 0.4;

      // 2. УМНОЕ РАСПРЕДЕЛЕНИЕ ЧАСТОТ (Анатомия звука на сфере)
      // Вместо случайного индекса привязываем частоты к положению точки на сфере
      // Точки на экваторе (direction.y близко к 0) будут реагировать на БАС.
      // Полюса (direction.y близко к 1 или -1) — на ВЫСОКИЕ ЧАСТОТЫ.
      const positionFactor = Math.abs(direction.y); // 0 на экваторе, 1 на полюсах
      
      // Вычисляем индекс в аудио-массиве на основе геометрии сферы
      let sampleIndex = Math.floor(positionFactor * (totalBins - 1));
      
      // Слегка подмешиваем шум, чтобы убрать слишком ровные кольца частот
      sampleIndex = (sampleIndex + Math.floor(Math.abs(noiseValue) * 30)) % totalBins;
      
      // Получаем чистое значение частоты
      let audioValue = dataArray.current[sampleIndex] / 255;

      // 3. ЭКСПОНЕНЦИАЛЬНОЕ УСИЛЕНИЕ (Динамический диапазон)
      // Нелинейное усиление делает тихие звуки мягкими, а громкие — взрывными
      audioValue = Math.pow(audioValue, 1.4); 

      // Дополнительно усиливаем басовую зону (экватор), чтобы сфера мощно качала от бита
      if (positionFactor < 0.3) {
        audioValue *= 1.6;
      }

      // 4. ВЫЧИСЛЕНИЕ ДЕФОРМАЦИИ
      // Теперь музыка (audioValue) и общая громкость трека (globalVolume) работают вместе
      const displacement = baseSphereRadius + 
                           (noiseValue * 2.5) + 
                           (audioValue * 12.0) * (noiseValue + 0.8) + 
                           (globalVolume * 3.0);
      
      vertex.copy(direction).multiplyScalar(displacement);
      
      // Делаем пушистый jitter, амплитуда которого тоже зависит от высоких частот на полюсах
      const jitterStrength = 0.04 + (positionFactor * audioValue * 0.3);
      vertex.x += Math.sin(i * 0.1) * jitterStrength;
      vertex.y += Math.cos(i * 0.1) * jitterStrength;
      vertex.z += Math.sin(i * 0.2) * jitterStrength;

      positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);

      // 5. ДИНАМИЧЕСКОЕ ОКРАШИВАНИЕ ОТ ЧАСТОТ
      let r = 0.1;
      let g = 0.1;
      let b = 0.1;

      if (audioValue > 0.03) {
        // Зоны средних частот окрашиваются в глубокий синий
        r = 0.05 + audioValue * 0.1;
        g = 0.05;
        b = 0.1 + audioValue * 0.9;

        // Басовый экватор при сильном ударе вспыхивает розово-пурпурным
        if (positionFactor < 0.4 && audioValue > 0.4) {
          r = 0.95 * audioValue;
          g = 0.05;
          b = 0.5 * audioValue;
        }
        
        // Высокочастотные полюса при появлении тарелок/вокала светятся неоновым бирюзовым
        if (positionFactor > 0.7 && audioValue > 0.2) {
          r = 0.05;
          g = 0.8 * audioValue;
          b = 0.9 * audioValue;
        }
      }

      colorAttribute.setXYZ(i, r, g, b);
    }

    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
  });

  return (
    <>
      <points ref={pointsRef}>
        <icosahedronGeometry args={[baseSphereRadius, 7]} />
        <pointsMaterial 
          size={0.12}
          sizeAttenuation={true}
          transparent={true}
          opacity={0.9}
          vertexColors={true}
        />
      </points>
      <OrbitControls enableDamping dampingFactor={0.05} />
    </>
  );
}
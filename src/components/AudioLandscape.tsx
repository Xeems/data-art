import  { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface AudioLandscapeProps {
  analyser: AnalyserNode | null;
}

export default function AudioLandscape({ analyser }: AudioLandscapeProps) {
  // Реф для облака точек
  const pointsRef = useRef<THREE.Points>(null);
  // Реф для массива частот, чтобы не выделять память каждый кадр
 const dataArray = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useFrame((state) => {
    if (!analyser || !pointsRef.current) return;

    // Ленивая инициализация массива в цикле анимации (вне рендера React)
    if (!dataArray.current) {
      dataArray.current = new Uint8Array(analyser.frequencyBinCount);
    }

    // Читаем текущие частоты из Web Audio API
    analyser.getByteFrequencyData(dataArray.current);

    const geometry = pointsRef.current.geometry as THREE.PlaneGeometry;
    const positionAttribute = geometry.attributes.position as THREE.BufferAttribute;
    
    // Получаем или динамически создаем атрибут цвета для вершин
    let colorAttribute = geometry.attributes.color as THREE.BufferAttribute;
    if (!colorAttribute) {
      const colors = new Float32Array(positionAttribute.count * 3);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      colorAttribute = geometry.attributes.color as THREE.BufferAttribute;
    }

    const time = state.clock.getElapsedTime();

    // Перебираем каждую точку ландшафта отдельно
    for (let i = 0; i < positionAttribute.count; i++) {
      const x = positionAttribute.getX(i);
      const y = positionAttribute.getY(i);

      // 1. Создаем многослойный псевдошум, чтобы убрать эффект повторяющейся плитки
      // Смешиваем три синусоиды с некратными частотами и разными скоростями времени
      const n1 = Math.sin(x * 0.08 + time * 0.5) * Math.cos(y * 0.07 - time * 0.4);
      const n2 = Math.sin(x * 0.17 - time * 0.3) * Math.cos(y * 0.21 + time * 0.6);
      const n3 = Math.sin((x + y) * 0.03 + time * 0.2);
      
      // Итоговое органическое значение шума (примерно от -1.0 до 1.0)
      const combinedNoise = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;

      // 2. Привязываем аудио-данные к рельефу шума
      // Переводим шум в диапазон от 0 до 1, чтобы получить индекс массива
      const noiseNormalized = (combinedNoise + 1) * 0.5;
      const sampleIndex = Math.floor(noiseNormalized * (dataArray.current.length - 1));
      
      // Получаем громкость конкретной частоты (от 0.0 до 1.0)
      const audioValue = dataArray.current[sampleIndex] / 255;

      // 3. Вычисляем финальную высоту Z для точки
      // Музыка плавно масштабирует высоту холмов, подбрасывая их вверх на пиках звука
      const z = combinedNoise * 4 + (audioValue * 11) * (combinedNoise + 0.4);
      positionAttribute.setZ(i, z);

      // 4. Логика индивидуального окрашивания точек
      // По умолчанию в тишине точки остаются стильными темно-серыми
      let r = 0.1;
      let g = 0.1;
      let b = 0.1;

      // Если в этой зоне играет музыка — плавно зажигаем цвета
      if (audioValue > 0.08) {
        // Склоны холмов окрашиваются в глубокий чернильно-синий
        r = 0.1 + audioValue * 0.15;
        g = 0.1;
        b = 0.1 + audioValue * 0.85;

        // Самые высокие горные хребты вспыхивают неоновым розово-пурпурным
        if (z > 3.0) {
          r = 0.9 * audioValue;
          g = 0.1;
          b = 0.5 * audioValue;
        }
      }

      // Записываем цвета в буфер (R, G, B) для текущей вершины
      colorAttribute.setXYZ(i, r, g, b);
    }

    // Сообщаем Three.js, что позиции и цвета точек обновились
    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
  });

  return (
    <>
      {/* Рендерим ландшафт как массив частиц (Points) */}
      <points ref={pointsRef} rotation={[-Math.PI / 2, 0, 0]}>
        {/* Большая площадь (100х100) и высокая плотность (200х200 сегментов) */}
        {/* <planeGeometry args={[50, 50, 200, 200]} /> */}
        <icosahedronGeometry args={[20, 4]} />
        <pointsMaterial 
          size={0.14}
          sizeAttenuation={true}  // Точки уменьшаются при отдалении камеры
          transparent={true}
          opacity={0.85}          // Прозрачность делает слои частиц воздушными
          vertexColors={true}     // Говорим материалу брать цвета из colorAttribute
        />
      </points>
      {/* Ограничиваем вращение OrbitControls, чтобы камера не падала под землю */}
      <OrbitControls maxPolarAngle={Math.PI / 2.1} />
    </>
  );
}


import { useState } from 'react';
import './App.css'

import TrackUploader from './components/TrackUploader'
import { Canvas } from '@react-three/fiber';

import SphereV1 from './components/SphereV1';
import AudioSphere from './components/AudioSphere';

function App() {
 const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);


  return (
    <div style={{ width: '100vw', height: '100vh', background: '#06060c', position: 'relative' }}>
      
      {/* Модуль интерфейса управления */}
      <TrackUploader onAnalyserCreated={setAnalyser} />

      {/* Модуль 3D графики */}
      <Canvas camera={{ position: [0, 15, 30], fov: 60 }}>
        <color attach="background" args={['#000000']} />
        {/* <fog attach="fog" args={['#ffffff', 100, 35]} /> */}
        <ambientLight intensity={0.3} />
        <pointLight position={[20, 30, 10]} intensity={1.5} color="#00ffff" />
        <pointLight position={[-20, -10, -10]} intensity={0.5} color="#ff00ff" />
        
        <AudioSphere analyser={analyser}/>
      </Canvas>
      
    </div>
  );
}

export default App

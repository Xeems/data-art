import { useRef, useState, type ChangeEvent } from 'react';

interface TrackUploaderProps {
  onAnalyserCreated: (analyser: AnalyserNode) => void;
}

export default function TrackUploader({ onAnalyserCreated }: TrackUploaderProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasTrack, setHasTrack] = useState(false);
  
  // Храним ссылку на узел громкости, чтобы менять её из ползунка
  const gainNodeRef = useRef<GainNode | null>(null);
  const [volume, setVolume] = useState(0.7); // Громкость по умолчанию (70%)

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    const fileURL = URL.createObjectURL(file);
    
    if (audioRef.current) {
      audioRef.current.src = fileURL;
      audioRef.current.play().catch(err => console.log("Ошибка автоплея:", err));
      setHasTrack(true);

      const AudioContextClass = window.AudioContext
      const audioCtx = new AudioContextClass();
      
      const source = audioCtx.createMediaElementSource(audioRef.current);
      const audioAnalyser = audioCtx.createAnalyser();
      audioAnalyser.fftSize = 512; 

      // ОТЗЫВЧИВОСТЬ СФЕРЫ
      audioAnalyser.smoothingTimeConstant = 0.05; 

      // 1. Создаем узел управления громкостью (GainNode)
      const gainNode = audioCtx.createGain();
      gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
      gainNodeRef.current = gainNode;

      // 2. Строим правильную цепочку (Граф):
      // Музыка -> Анализатор (берет чистый звук) -> Микшер Громкости -> Динамики
      source.connect(audioAnalyser);
      audioAnalyser.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      onAnalyserCreated(audioAnalyser);
    }
  };

  // Функция плавного изменения громкости микшера
  const handleVolumeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(event.target.value);
    setVolume(newVolume);

    if (gainNodeRef.current) {
      // Использование valueAtTime предотвращает неприятные щелчки при резком движении ползунка
      gainNodeRef.current.gain.setValueAtTime(newVolume, 0);
    }
  };

  return (
    <div style={{
      position: 'absolute',
      top: 24,
      left: 24,
      zIndex: 10,
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
      backgroundColor: 'rgba(10, 10, 20, 0.75)',
      padding: '20px',
      borderRadius: '12px',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      width: '280px'
    }}>
      <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', letterSpacing: '0.5px' }}>
        Музыкальный Дата-Арт
      </h2>
      
      <input 
        type="file" 
        accept="audio/*" 
        onChange={handleFileChange} 
        style={{ marginBottom: 16, display: 'block', width: '100%', color: '#ccc' }} 
      />

      {/* Полноценный кастомный микшер, показывающийся только после загрузки трека */}
      {hasTrack && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'between', marginBottom: 6, fontSize: '0.85rem', color: '#aaa' }}>
            <span>Громкость микшера:</span>
            <span style={{ marginLeft: 'auto', color: '#00ffcc', fontWeight: 'bold' }}>
              {Math.round(volume * 100)}%
            </span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            value={volume} 
            onChange={handleVolumeChange}
            style={{
              width: '100%',
              accentColor: '#00ffcc', // Цвет ползунка под стиль ландшафта
              cursor: 'pointer'
            }}
          />
        </div>
      )}
      
      <audio 
        ref={audioRef} 
        controls 
        style={{ 
          display: hasTrack ? 'block' : 'none', 
          width: '100%',
          height: '40px'
        }} 
      />
    </div>
  );
}

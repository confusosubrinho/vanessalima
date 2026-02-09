import { useState, useRef } from 'react';
import { X, Play, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FloatingVideoProps {
  videoUrl: string;
  productName?: string;
}

export function FloatingVideo({ videoUrl, productName }: FloatingVideoProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!isOpen) return null;

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 group">
      <div className="relative w-[140px] h-[200px] md:w-[160px] md:h-[240px] rounded-2xl overflow-hidden shadow-2xl border-2 border-background bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-cover cursor-pointer"
          loop
          muted={isMuted}
          autoPlay
          playsInline
          onClick={togglePlay}
        />

        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(false)}
          className="absolute top-1 right-1 h-6 w-6 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="h-3 w-3" />
        </Button>

        {/* Controls */}
        <div className="absolute bottom-1 left-1 right-1 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePlay}
            className="h-6 w-6 bg-black/50 hover:bg-black/70 text-white rounded-full"
          >
            {isPlaying ? (
              <span className="text-xs font-bold">II</span>
            ) : (
              <Play className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            className="h-6 w-6 bg-black/50 hover:bg-black/70 text-white rounded-full"
          >
            {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

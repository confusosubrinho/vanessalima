import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { X } from 'lucide-react';

interface AnnouncementMessage {
  text: string;
  link?: string | null;
}

interface AnnouncementConfig {
  id: string;
  is_active: boolean;
  messages: AnnouncementMessage[];
  bg_color: string;
  text_color: string;
  font_size: string;
  autoplay: boolean;
  autoplay_speed: number;
  closeable: boolean;
}

export function AnnouncementBar() {
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('announcement-dismissed') === 'true');
  const [currentIndex, setCurrentIndex] = useState(0);

  const { data: config } = useQuery({
    queryKey: ['announcement-bar'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcement_bar')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as AnnouncementConfig | null;
    },
    staleTime: 1000 * 60 * 5,
  });

  const messages = config?.messages || [];

  useEffect(() => {
    if (!config?.autoplay || messages.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % messages.length);
    }, (config.autoplay_speed || 4) * 1000);
    return () => clearInterval(interval);
  }, [config?.autoplay, config?.autoplay_speed, messages.length]);

  if (dismissed || !config?.is_active || !messages.length) return null;

  const handleDismiss = () => {
    sessionStorage.setItem('announcement-dismissed', 'true');
    setDismissed(true);
  };

  const msg = messages[currentIndex];
  const fontSize = config.font_size === 'xs' ? 'text-xs' : config.font_size === 'base' ? 'text-base' : 'text-sm';

  const content = (
    <span className={`${fontSize} font-medium transition-opacity duration-300`}>{msg.text}</span>
  );

  return (
    <div
      className="relative flex items-center justify-center px-8 py-1.5"
      style={{ backgroundColor: config.bg_color, color: config.text_color }}
    >
      {msg.link ? (
        <a href={msg.link} className="hover:underline">{content}</a>
      ) : content}
      {config.closeable && (
        <button
          onClick={handleDismiss}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/10 transition-colors"
          aria-label="Fechar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

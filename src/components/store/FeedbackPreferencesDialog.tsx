/**
 * Modal de preferências: feedback tátil (mobile) e som opcional.
 * Respeita prefers-reduced-motion (não vibrar/não animar quando ativado no SO).
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useFeedback } from '@/hooks/useFeedback';
import { prefersReducedMotion } from '@/lib/feedback';
import { Settings2 } from 'lucide-react';

export function FeedbackPreferencesDialog({
  trigger,
}: {
  trigger?: React.ReactNode;
}) {
  const { enabled, setEnabled, soundEnabled, setSoundEnabled } = useFeedback();
  const [open, setOpen] = useState(false);
  const reducedMotion = typeof window !== 'undefined' && prefersReducedMotion();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="text-sm text-secondary-foreground/80 hover:text-primary transition-colors flex items-center gap-2 py-1"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Preferências
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Preferências</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-2">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="feedback-tactile" className="text-sm font-medium">
                Feedback tátil (mobile)
              </Label>
              <p className="text-xs text-muted-foreground">
                Vibração leve em ações como adicionar ao carrinho e finalizar compra.
              </p>
            </div>
            <Switch
              id="feedback-tactile"
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={reducedMotion}
            />
          </div>
          {reducedMotion && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              Seu dispositivo está com &quot;reduzir movimento&quot; ativado. O feedback tátil não será usado.
            </p>
          )}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="feedback-sound" className="text-sm font-medium">
                Som de feedback (opcional)
              </Label>
              <p className="text-xs text-muted-foreground">
                Um clique discreto ao tocar em ações importantes. Desligado por padrão.
              </p>
            </div>
            <Switch
              id="feedback-sound"
              checked={soundEnabled}
              onCheckedChange={setSoundEnabled}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

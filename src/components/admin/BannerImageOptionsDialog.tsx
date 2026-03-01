import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { getImageDimensions } from '@/lib/imageCompressor';
import type { ProcessBannerImageOptions } from '@/lib/imageCompressor';
import { Zap } from 'lucide-react';

const BANNER_MAX_WIDTH = 1920;
const BANNER_MAX_HEIGHT = 600;

export interface BannerImageOptionsResult extends ProcessBannerImageOptions {
  /** Aplicar redimensionamento para caber em 1920×600 (só relevante se imagem for maior) */
  resizeToMax: boolean;
  /** Aplicar compressão (qualidade) */
  compress: boolean;
}

interface BannerImageOptionsDialogProps {
  open: boolean;
  file: File | null;
  onConfirm: (options: BannerImageOptionsResult) => void;
  onCancel: () => void;
}

export function BannerImageOptionsDialog({
  open,
  file,
  onConfirm,
  onCancel,
}: BannerImageOptionsDialogProps) {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const isLargerThanMax =
    dimensions != null &&
    (dimensions.width > BANNER_MAX_WIDTH || dimensions.height > BANNER_MAX_HEIGHT);

  const [resizeToMax, setResizeToMax] = useState(true);
  const [compress, setCompress] = useState(true);
  const [qualityPercent, setQualityPercent] = useState(80);
  const [convertToWebP, setConvertToWebP] = useState(true);

  useEffect(() => {
    if (!open || !file || !file.type.startsWith('image/')) {
      setDimensions(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    getImageDimensions(file)
      .then((d) => {
        setDimensions(d);
        setResizeToMax(d.width > BANNER_MAX_WIDTH || d.height > BANNER_MAX_HEIGHT);
      })
      .catch(() => setDimensions(null))
      .finally(() => setLoading(false));
  }, [open, file]);

  const handleConfirm = () => {
    const options: BannerImageOptionsResult = {
      resizeToMax,
      compress,
      quality: compress ? qualityPercent / 100 : 1,
      convertToWebP,
      ...(resizeToMax && isLargerThanMax
        ? { maxWidth: BANNER_MAX_WIDTH, maxHeight: BANNER_MAX_HEIGHT }
        : {}),
    };
    onConfirm(options);
  };

  const suggested = resizeToMax && compress && convertToWebP;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurar imagem do banner</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground text-sm">Carregando dimensões...</p>
        ) : dimensions ? (
          <div className="space-y-6 py-2">
            <p className="text-sm text-muted-foreground">
              Dimensões da imagem: <strong>{dimensions.width} × {dimensions.height} px</strong>
            </p>

            {isLargerThanMax && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="resize">Redimensionar para 1920×600 (recomendado)</Label>
                  <Switch
                    id="resize"
                    checked={resizeToMax}
                    onCheckedChange={setResizeToMax}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Imagens maiores que 1920×600 podem deixar o site mais lento. Redimensionar melhora a velocidade.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="compress">Comprimir para melhorar a velocidade</Label>
                <Switch id="compress" checked={compress} onCheckedChange={setCompress} />
              </div>
              {compress && (
                <div className="space-y-1 pl-1">
                  <Label className="text-xs">Qualidade: {qualityPercent}%</Label>
                  <Slider
                    value={[qualityPercent]}
                    onValueChange={([v]) => setQualityPercent(v ?? 80)}
                    min={50}
                    max={100}
                    step={5}
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Comprimir reduz o tamanho do arquivo e acelera o carregamento da página.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="webp">Converter para WebP (recomendado)</Label>
                <Switch id="webp" checked={convertToWebP} onCheckedChange={setConvertToWebP} />
              </div>
              <p className="text-xs text-muted-foreground">
                WebP geralmente gera arquivos menores com mesma qualidade, melhorando a velocidade do site.
              </p>
            </div>

            {!suggested && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <Zap className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <p>
                  Recomendamos ativar todas as opções acima para melhor desempenho e velocidade do site.
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Selecione uma imagem válida.</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={loading || !dimensions}>
            Aplicar e enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Palette, Type, Save, RotateCcw } from 'lucide-react';
import { SiteTheme, applyThemeToDOM, darkenHex, lightenHex } from '@/hooks/useSiteTheme';

const GOOGLE_FONTS = [
  'Maven Pro', 'Lato', 'Inter', 'Poppins', 'Roboto', 'Open Sans', 'Montserrat',
  'Nunito', 'Raleway', 'Playfair Display', 'Merriweather', 'Source Sans 3',
  'DM Sans', 'Outfit', 'Sora', 'Space Grotesk', 'Plus Jakarta Sans',
  'Jost', 'Mulish', 'Karla', 'Libre Baskerville', 'Crimson Text',
];

const BORDER_RADIUS_OPTIONS = [
  { value: 'none', label: 'Nenhum' },
  { value: 'small', label: 'Pequeno' },
  { value: 'medium', label: 'Médio' },
  { value: 'large', label: 'Grande' },
  { value: 'full', label: 'Arredondado' },
];

const DEFAULT_THEME: Omit<SiteTheme, 'id' | 'updated_at'> = {
  primary_color: '#33cc99',
  primary_color_dark: '#2ba882',
  primary_color_light: '#e6f9f2',
  accent_color: '#1a1a1a',
  background_color: '#ffffff',
  text_color: '#1a1a1a',
  font_family: 'Maven Pro',
  font_heading: 'Maven Pro',
  border_radius: 'medium',
  shadow_intensity: 'medium',
};

export default function ThemeEditor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: theme, isLoading } = useQuery({
    queryKey: ['site-theme'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_theme')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as SiteTheme | null;
    },
  });

  const [form, setForm] = useState(DEFAULT_THEME);

  useEffect(() => {
    if (theme) {
      setForm({
        primary_color: theme.primary_color,
        primary_color_dark: theme.primary_color_dark,
        primary_color_light: theme.primary_color_light,
        accent_color: theme.accent_color,
        background_color: theme.background_color,
        text_color: theme.text_color,
        font_family: theme.font_family,
        font_heading: theme.font_heading,
        border_radius: theme.border_radius || 'medium',
        shadow_intensity: theme.shadow_intensity || 'medium',
      });
    }
  }, [theme]);

  // Live preview on form change
  useEffect(() => {
    applyThemeToDOM({ ...form, id: '', updated_at: '' } as SiteTheme);
  }, [form]);

  const handlePrimaryChange = (color: string) => {
    setForm(prev => ({
      ...prev,
      primary_color: color,
      primary_color_dark: darkenHex(color),
      primary_color_light: lightenHex(color),
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (theme?.id) {
        const { error } = await supabase
          .from('site_theme')
          .update(form as Record<string, unknown>)
          .eq('id', theme.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('site_theme')
          .insert(form as Record<string, unknown>);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-theme'] });
      toast({ title: 'Tema salvo com sucesso!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    },
  });

  const handleReset = () => {
    setForm(DEFAULT_THEME);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Palette className="h-5 w-5" /> Tema Visual</h2>
          <p className="text-sm text-muted-foreground">Customize cores, fontes e estilo do seu site</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1" /> Resetar
          </Button>
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="h-4 w-4 mr-1" /> {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>

      {/* Colors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cores</CardTitle>
          <CardDescription>A cor primária define botões, links e destaques do site</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Cor Primária</Label>
              <div className="flex gap-2 items-center mt-1">
                <input
                  type="color"
                  value={form.primary_color}
                  onChange={(e) => handlePrimaryChange(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                />
                <Input
                  value={form.primary_color}
                  onChange={(e) => handlePrimaryChange(e.target.value)}
                  className="font-mono text-sm"
                  maxLength={7}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Primária Escura</Label>
              <div className="flex gap-2 items-center mt-1">
                <input
                  type="color"
                  value={form.primary_color_dark}
                  onChange={(e) => setForm(prev => ({ ...prev, primary_color_dark: e.target.value }))}
                  className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                />
                <Input
                  value={form.primary_color_dark}
                  onChange={(e) => setForm(prev => ({ ...prev, primary_color_dark: e.target.value }))}
                  className="font-mono text-sm"
                  maxLength={7}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Primária Clara</Label>
              <div className="flex gap-2 items-center mt-1">
                <input
                  type="color"
                  value={form.primary_color_light}
                  onChange={(e) => setForm(prev => ({ ...prev, primary_color_light: e.target.value }))}
                  className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                />
                <Input
                  value={form.primary_color_light}
                  onChange={(e) => setForm(prev => ({ ...prev, primary_color_light: e.target.value }))}
                  className="font-mono text-sm"
                  maxLength={7}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Cor de Destaque</Label>
              <div className="flex gap-2 items-center mt-1">
                <input
                  type="color"
                  value={form.accent_color}
                  onChange={(e) => setForm(prev => ({ ...prev, accent_color: e.target.value }))}
                  className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                />
                <Input
                  value={form.accent_color}
                  onChange={(e) => setForm(prev => ({ ...prev, accent_color: e.target.value }))}
                  className="font-mono text-sm"
                  maxLength={7}
                />
              </div>
            </div>
          </div>

          {/* Preview swatches */}
          <div className="flex gap-2 mt-4">
            <div className="flex-1 h-12 rounded-lg flex items-center justify-center text-sm font-medium text-white" style={{ backgroundColor: form.primary_color }}>
              Primária
            </div>
            <div className="flex-1 h-12 rounded-lg flex items-center justify-center text-sm font-medium text-white" style={{ backgroundColor: form.primary_color_dark }}>
              Escura
            </div>
            <div className="flex-1 h-12 rounded-lg flex items-center justify-center text-sm font-medium border" style={{ backgroundColor: form.primary_color_light, color: form.primary_color_dark }}>
              Clara
            </div>
            <div className="flex-1 h-12 rounded-lg flex items-center justify-center text-sm font-medium text-white" style={{ backgroundColor: form.accent_color }}>
              Destaque
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Typography */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Type className="h-4 w-4" /> Tipografia</CardTitle>
          <CardDescription>Escolha fontes Google para o corpo e títulos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Fonte do Corpo</Label>
              <Select value={form.font_family} onValueChange={(v) => setForm(prev => ({ ...prev, font_family: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOOGLE_FONTS.map(f => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fonte dos Títulos</Label>
              <Select value={form.font_heading} onValueChange={(v) => setForm(prev => ({ ...prev, font_heading: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOOGLE_FONTS.map(f => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Typography preview */}
          <div className="p-4 border rounded-lg space-y-2">
            <h3 className="text-lg font-bold" style={{ fontFamily: `'${form.font_heading}', sans-serif` }}>
              Preview do Título
            </h3>
            <p className="text-sm text-muted-foreground" style={{ fontFamily: `'${form.font_family}', sans-serif` }}>
              Este é um texto de exemplo para visualizar como a fonte do corpo ficará no seu site.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Style */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estilo</CardTitle>
          <CardDescription>Cantos arredondados e sombras</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Raio de Borda</Label>
              <Select value={form.border_radius} onValueChange={(v) => setForm(prev => ({ ...prev, border_radius: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BORDER_RADIUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Button preview */}
          <div className="flex gap-3 mt-4">
            <Button size="sm">Botão Primário</Button>
            <Button size="sm" variant="outline">Outline</Button>
            <Button size="sm" variant="secondary">Secundário</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { compressImageToWebP } from '@/lib/imageCompressor';
import { Plus, Pencil, Trash2, Upload, Eye, EyeOff, FileText, Settings2, Search, Globe, Image as ImageIcon } from 'lucide-react';
import type { BlogPost, BlogSettings } from '@/hooks/useBlog';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

interface PostFormData {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featured_image_url: string;
  status: 'draft' | 'published';
  published_at: string;
  seo_title: string;
  seo_description: string;
  author_name: string;
}

const emptyForm: PostFormData = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  featured_image_url: '',
  status: 'draft',
  published_at: '',
  seo_title: '',
  seo_description: '',
  author_name: '',
};

export default function BlogAdmin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [formData, setFormData] = useState<PostFormData>(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [autoSlug, setAutoSlug] = useState(true);

  // Blog settings
  const { data: settings } = useQuery({
    queryKey: ['blog-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('blog_settings').select('*').limit(1).maybeSingle();
      if (error) throw error;
      return data as BlogSettings | null;
    },
  });

  // All posts (admin sees drafts too)
  const { data: posts, isLoading } = useQuery({
    queryKey: ['blog-posts', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as BlogPost[]) || [];
    },
  });

  // Toggle blog active
  const toggleBlog = useMutation({
    mutationFn: async (isActive: boolean) => {
      if (!settings?.id) return;
      const { error } = await supabase.from('blog_settings').update({ is_active: isActive }).eq('id', settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blog-settings'] });
      toast({ title: settings?.is_active ? 'Blog desativado' : 'Blog ativado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  // Image upload
  const handleImageUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const { file: compressed, fileName } = await compressImageToWebP(file);
      const { error } = await supabase.storage.from('product-media').upload(fileName, compressed);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('product-media').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, featured_image_url: publicUrl }));
      toast({ title: 'Imagem enviada!' });
    } catch (err: any) {
      toast({ title: 'Erro ao enviar imagem', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }, [toast]);

  // Save post
  const saveMutation = useMutation({
    mutationFn: async (data: PostFormData) => {
      const postData = {
        title: data.title,
        slug: data.slug,
        excerpt: data.excerpt || null,
        content: data.content || null,
        featured_image_url: data.featured_image_url || null,
        status: data.status,
        published_at: data.status === 'published'
          ? (data.published_at || new Date().toISOString())
          : (data.published_at || null),
        seo_title: data.seo_title || null,
        seo_description: data.seo_description || null,
        author_name: data.author_name || null,
      };
      if (editingPost) {
        const { error } = await supabase.from('blog_posts').update(postData).eq('id', editingPost.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('blog_posts').insert(postData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blog-posts'] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: editingPost ? 'Post atualizado!' : 'Post criado!' });
    },
    onError: (err: any) => {
      const msg = err.message?.includes('blog_posts_slug_key') ? 'Slug já em uso. Escolha outro.' : err.message;
      toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' });
    },
  });

  // Delete post
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('blog_posts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blog-posts'] });
      toast({ title: 'Post excluído!' });
    },
  });

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingPost(null);
    setAutoSlug(true);
  };

  const handleEdit = (post: BlogPost) => {
    setEditingPost(post);
    setAutoSlug(false);
    setFormData({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt || '',
      content: post.content || '',
      featured_image_url: post.featured_image_url || '',
      status: post.status as 'draft' | 'published',
      published_at: post.published_at ? post.published_at.slice(0, 16) : '',
      seo_title: post.seo_title || '',
      seo_description: post.seo_description || '',
      author_name: post.author_name || '',
    });
    setIsDialogOpen(true);
  };

  const handleTitleChange = (title: string) => {
    setFormData(prev => ({
      ...prev,
      title,
      slug: autoSlug ? slugify(title) : prev.slug,
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Blog</h1>
          <p className="text-sm text-muted-foreground">Gerencie os posts do blog da sua loja</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={settings?.is_active ?? false}
              onCheckedChange={(checked) => toggleBlog.mutate(checked)}
              disabled={toggleBlog.isPending}
            />
            <Label className="text-sm font-medium">
              {settings?.is_active ? 'Blog ativo' : 'Blog desativado'}
            </Label>
          </div>
        </div>
      </div>

      {!settings?.is_active && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold mb-1">Blog desativado</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Ative o blog para que ele apareça no menu institucional do site. Os posts salvos serão mantidos.
            </p>
            <Button onClick={() => toggleBlog.mutate(true)} disabled={toggleBlog.isPending}>
              Ativar Blog
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Posts list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg">Posts</CardTitle>
            <CardDescription>{posts?.length || 0} post(s) cadastrado(s)</CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" />Novo Post</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingPost ? 'Editar Post' : 'Novo Post'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-4">
                <Tabs defaultValue="content">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="content"><FileText className="h-4 w-4 mr-1" />Conteúdo</TabsTrigger>
                    <TabsTrigger value="media"><ImageIcon className="h-4 w-4 mr-1" />Mídia</TabsTrigger>
                    <TabsTrigger value="seo"><Globe className="h-4 w-4 mr-1" />SEO</TabsTrigger>
                  </TabsList>

                  <TabsContent value="content" className="space-y-4 mt-4">
                    <div>
                      <Label>Título *</Label>
                      <Input
                        value={formData.title}
                        onChange={(e) => handleTitleChange(e.target.value)}
                        placeholder="Título do post"
                        required
                      />
                    </div>
                    <div>
                      <Label>Slug (URL)</Label>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">/blog/</span>
                        <Input
                          value={formData.slug}
                          onChange={(e) => { setAutoSlug(false); setFormData(prev => ({ ...prev, slug: e.target.value })); }}
                          placeholder="url-do-post"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Resumo / Descrição curta</Label>
                      <Textarea
                        value={formData.excerpt}
                        onChange={(e) => setFormData(prev => ({ ...prev, excerpt: e.target.value }))}
                        placeholder="Breve resumo do post..."
                        rows={2}
                      />
                    </div>
                    <div>
                      <Label>Conteúdo</Label>
                      <Textarea
                        value={formData.content}
                        onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                        placeholder="Conteúdo do post (HTML suportado)..."
                        rows={10}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Status</Label>
                        <Select value={formData.status} onValueChange={(v) => setFormData(prev => ({ ...prev, status: v as 'draft' | 'published' }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Rascunho</SelectItem>
                            <SelectItem value="published">Publicado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Data de publicação</Label>
                        <Input
                          type="datetime-local"
                          value={formData.published_at}
                          onChange={(e) => setFormData(prev => ({ ...prev, published_at: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Autor (opcional)</Label>
                      <Input
                        value={formData.author_name}
                        onChange={(e) => setFormData(prev => ({ ...prev, author_name: e.target.value }))}
                        placeholder="Nome do autor"
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="media" className="space-y-4 mt-4">
                    <div>
                      <Label>Imagem Destacada</Label>
                      <div className="flex gap-2">
                        <Input
                          value={formData.featured_image_url}
                          onChange={(e) => setFormData(prev => ({ ...prev, featured_image_url: e.target.value }))}
                          placeholder="URL da imagem ou faça upload"
                        />
                        <label className="cursor-pointer">
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
                          <Button type="button" variant="outline" asChild>
                            <span><Upload className="h-4 w-4 mr-1" />{uploading ? '...' : 'Upload'}</span>
                          </Button>
                        </label>
                      </div>
                      {formData.featured_image_url && (
                        <div className="mt-3 rounded-lg overflow-hidden border bg-muted">
                          <img src={formData.featured_image_url} alt="Preview" className="w-full max-h-48 object-cover" />
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="seo" className="space-y-4 mt-4">
                    <div className="bg-muted/50 rounded-lg p-4 space-y-1">
                      <p className="text-sm font-medium">Preview no Google</p>
                      <p className="text-sm text-primary truncate">
                        {window.location.origin}/blog/{formData.slug || 'url-do-post'}
                      </p>
                      <p className="text-base text-foreground font-medium truncate">
                        {formData.seo_title || formData.title || 'Título do post'}
                      </p>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {formData.seo_description || formData.excerpt || 'Descrição do post...'}
                      </p>
                    </div>
                    <div>
                      <Label>Meta Title (SEO)</Label>
                      <Input
                        value={formData.seo_title}
                        onChange={(e) => setFormData(prev => ({ ...prev, seo_title: e.target.value }))}
                        placeholder={formData.title || 'Título para mecanismos de busca'}
                        maxLength={60}
                      />
                      <p className="text-xs text-muted-foreground mt-1">{(formData.seo_title || '').length}/60 caracteres</p>
                    </div>
                    <div>
                      <Label>Meta Description (SEO)</Label>
                      <Textarea
                        value={formData.seo_description}
                        onChange={(e) => setFormData(prev => ({ ...prev, seo_description: e.target.value }))}
                        placeholder={formData.excerpt || 'Descrição para mecanismos de busca'}
                        maxLength={160}
                        rows={3}
                      />
                      <p className="text-xs text-muted-foreground mt-1">{(formData.seo_description || '').length}/160 caracteres</p>
                    </div>
                  </TabsContent>
                </Tabs>

                <Separator />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4">Carregando...</p>
          ) : !posts?.length ? (
            <div className="text-center py-8">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum post cadastrado. Crie o primeiro!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {posts.map((post) => (
                <div key={post.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  {post.featured_image_url ? (
                    <img src={post.featured_image_url} alt="" className="w-16 h-12 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-16 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{post.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant={post.status === 'published' ? 'default' : 'secondary'} className="text-[10px]">
                        {post.status === 'published' ? 'Publicado' : 'Rascunho'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">/blog/{post.slug}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(post)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir post?</AlertDialogTitle>
                          <AlertDialogDescription>
                            O post "{post.title}" será excluído permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(post.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

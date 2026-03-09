import { useParams, Link } from 'react-router-dom';
import { StoreLayout } from '@/components/store/StoreLayout';
import { useBlogPost, useBlogSettings } from '@/hooks/useBlog';
import { Skeleton } from '@/components/ui/skeleton';
import { Helmet } from 'react-helmet-async';
import { sanitizeHtml } from '@/lib/sanitizeHtml';
import { Calendar, ArrowLeft, User, Share2, Copy, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import NotFound from './NotFound';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: settings, isLoading: settingsLoading } = useBlogSettings();
  const { data: post, isLoading: postLoading } = useBlogPost(slug || '');
  const { toast } = useToast();

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({ title: 'Link copiado!' });
  };

  const handleShareWhatsApp = () => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(post?.title || '');
    window.open(`https://wa.me/?text=${text}%20${url}`, '_blank');
  };

  if (settingsLoading || postLoading) {
    return (
      <StoreLayout>
        <div className="container-custom py-12 max-w-3xl mx-auto">
          <Skeleton className="h-4 w-48 mb-6" />
          <Skeleton className="h-8 w-3/4 mb-4" />
          <Skeleton className="h-4 w-48 mb-6" />
          <Skeleton className="h-80 w-full rounded-2xl mb-8" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </StoreLayout>
    );
  }

  if (!settings?.is_active || !post || post.status !== 'published') {
    return <NotFound />;
  }

  const metaTitle = post.seo_title || post.title;
  const metaDescription = post.seo_description || post.excerpt || '';
  const canonicalUrl = `${window.location.origin}/blog/${post.slug}`;

  return (
    <StoreLayout>
      <Helmet>
        <title>{metaTitle} | Blog</title>
        {metaDescription && <meta name="description" content={metaDescription} />}
        {post.featured_image_url && <meta property="og:image" content={post.featured_image_url} />}
        <meta property="og:title" content={metaTitle} />
        <meta property="og:type" content="article" />
        {metaDescription && <meta property="og:description" content={metaDescription} />}
        <link rel="canonical" href={canonicalUrl} />
      </Helmet>

      <article className="container-custom py-8 md:py-14">
        <div className="max-w-3xl mx-auto">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-6 flex-wrap">
            <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <Link to="/blog" className="hover:text-foreground transition-colors">Blog</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground truncate max-w-[200px]">{post.title}</span>
          </nav>

          {/* Header */}
          <header className="mb-6 md:mb-8">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold leading-tight mb-4">{post.title}</h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {post.published_at && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDate(post.published_at)}
                </span>
              )}
              {post.author_name && (
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  {post.author_name}
                </span>
              )}
            </div>
          </header>

          {/* Featured image */}
          {post.featured_image_url && (
            <div className="rounded-2xl overflow-hidden mb-8 md:mb-10 -mx-4 sm:mx-0">
              <img
                src={post.featured_image_url}
                alt={post.title}
                className="w-full aspect-video object-cover"
              />
            </div>
          )}

          {/* Content */}
          {post.content ? (
            <div
              className="
                prose prose-sm sm:prose-base max-w-none
                text-foreground/80
                [&_h2]:text-xl [&_h2]:sm:text-2xl [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mt-10 [&_h2]:mb-4
                [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-8 [&_h3]:mb-3
                [&_p]:mb-5 [&_p]:leading-relaxed
                [&_strong]:text-foreground [&_strong]:font-semibold
                [&_ul]:space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-5
                [&_ol]:space-y-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-5
                [&_li]:leading-relaxed
                [&_img]:rounded-xl [&_img]:my-8
                [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-5 [&_blockquote]:py-1 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:my-6
                [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
              "
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }}
            />
          ) : post.excerpt ? (
            <p className="text-muted-foreground text-lg leading-relaxed">{post.excerpt}</p>
          ) : null}

          {/* Share & footer */}
          <div className="mt-10 md:mt-14 pt-6 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <Button asChild variant="outline" size="sm">
              <Link to="/blog" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Ver todos os posts
              </Link>
            </Button>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">Compartilhar:</span>
              <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={handleCopyLink} title="Copiar link">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={handleShareWhatsApp} title="Enviar por WhatsApp">
                <Share2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </article>
    </StoreLayout>
  );
}

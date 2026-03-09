import { useParams, Link } from 'react-router-dom';
import { StoreLayout } from '@/components/store/StoreLayout';
import { useBlogPost, useBlogSettings } from '@/hooks/useBlog';
import { Skeleton } from '@/components/ui/skeleton';
import { Helmet } from 'react-helmet-async';
import { sanitizeHtml } from '@/lib/sanitizeHtml';
import { Calendar, ArrowLeft, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  if (settingsLoading || postLoading) {
    return (
      <StoreLayout>
        <div className="container-custom py-12 max-w-3xl mx-auto">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full rounded-xl mb-6" />
          <Skeleton className="h-6 w-full mb-2" />
          <Skeleton className="h-6 w-3/4" />
        </div>
      </StoreLayout>
    );
  }

  if (!settings?.is_active || !post || post.status !== 'published') {
    return <NotFound />;
  }

  const metaTitle = post.seo_title || post.title;
  const metaDescription = post.seo_description || post.excerpt || '';

  return (
    <StoreLayout>
      <Helmet>
        <title>{metaTitle} | Blog</title>
        {metaDescription && <meta name="description" content={metaDescription} />}
        {post.featured_image_url && <meta property="og:image" content={post.featured_image_url} />}
        <meta property="og:title" content={metaTitle} />
        <meta property="og:type" content="article" />
        {metaDescription && <meta property="og:description" content={metaDescription} />}
        <link rel="canonical" href={`${window.location.origin}/blog/${post.slug}`} />
      </Helmet>

      <article className="container-custom py-10 md:py-14">
        <div className="max-w-3xl mx-auto">
          {/* Back link */}
          <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao blog
          </Link>

          {/* Header */}
          <header className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-4">{post.title}</h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {post.published_at && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDate(post.published_at)}
                </div>
              )}
              {post.author_name && (
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  {post.author_name}
                </div>
              )}
            </div>
          </header>

          {/* Featured image */}
          {post.featured_image_url && (
            <div className="rounded-xl overflow-hidden mb-8">
              <img
                src={post.featured_image_url}
                alt={post.title}
                className="w-full max-h-[480px] object-cover"
              />
            </div>
          )}

          {/* Content */}
          {post.content ? (
            <div
              className="prose prose-sm md:prose-base max-w-none text-muted-foreground [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-4 [&_strong]:text-foreground [&_ul]:space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:space-y-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_img]:rounded-lg [&_img]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:italic"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }}
            />
          ) : post.excerpt ? (
            <p className="text-muted-foreground text-lg leading-relaxed">{post.excerpt}</p>
          ) : null}

          {/* Footer */}
          <div className="mt-12 pt-8 border-t">
            <Button asChild variant="outline">
              <Link to="/blog" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Ver todos os posts
              </Link>
            </Button>
          </div>
        </div>
      </article>
    </StoreLayout>
  );
}

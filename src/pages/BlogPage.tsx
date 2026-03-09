import { Link } from 'react-router-dom';
import { StoreLayout } from '@/components/store/StoreLayout';
import { useBlogPosts, useBlogSettings } from '@/hooks/useBlog';
import { Skeleton } from '@/components/ui/skeleton';
import { Helmet } from 'react-helmet-async';
import { Calendar, ArrowRight } from 'lucide-react';
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

export default function BlogPage() {
  const { data: settings, isLoading: settingsLoading } = useBlogSettings();
  const { data: posts, isLoading: postsLoading } = useBlogPosts(true);

  if (settingsLoading) {
    return (
      <StoreLayout>
        <div className="container-custom py-12">
          <Skeleton className="h-10 w-48 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-72 rounded-xl" />
            ))}
          </div>
        </div>
      </StoreLayout>
    );
  }

  if (!settings?.is_active) {
    return <NotFound />;
  }

  return (
    <StoreLayout>
      <Helmet>
        <title>Blog | Loja</title>
        <meta name="description" content="Confira nossos artigos e novidades no blog." />
      </Helmet>
      <div className="container-custom py-10 md:py-14">
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Blog</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Novidades, dicas e inspirações para você
          </p>
        </div>

        {postsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-72 rounded-xl" />
            ))}
          </div>
        ) : !posts?.length ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">Nenhum post publicado ainda. Volte em breve!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <Link
                key={post.id}
                to={`/blog/${post.slug}`}
                className="group bg-background rounded-xl border overflow-hidden hover:shadow-lg transition-shadow"
              >
                {post.featured_image_url ? (
                  <div className="aspect-[16/9] overflow-hidden">
                    <img
                      src={post.featured_image_url}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="aspect-[16/9] bg-muted flex items-center justify-center">
                    <span className="text-3xl text-muted-foreground/30">📝</span>
                  </div>
                )}
                <div className="p-5 space-y-3">
                  {post.published_at && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatDate(post.published_at)}
                    </div>
                  )}
                  <h2 className="text-lg font-semibold leading-tight group-hover:text-primary transition-colors line-clamp-2">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {post.excerpt}
                    </p>
                  )}
                  <div className="flex items-center gap-1 text-sm text-primary font-medium pt-1">
                    Ler mais <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </StoreLayout>
  );
}

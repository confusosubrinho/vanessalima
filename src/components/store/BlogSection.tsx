import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, User } from 'lucide-react';
import { useBlogPosts, useBlogSettings } from '@/hooks/useBlog';
import { resolveImageUrl } from '@/lib/imageUrl';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BlogSectionProps {
  config?: { max_posts?: number };
}

export function BlogSection({ config }: BlogSectionProps) {
  const { data: settings } = useBlogSettings();
  const { data: posts, isLoading } = useBlogPosts(true);

  const maxPosts = config?.max_posts || 6;

  // Don't render if blog is disabled or no posts
  if (settings && !settings.is_active) return null;
  if (!isLoading && (!posts || posts.length === 0)) return null;

  const visiblePosts = posts?.slice(0, maxPosts) || [];

  return (
    <section className="py-12 md:py-16 bg-background">
      <div className="container-custom">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Nosso Blog
            </h2>
            <p className="text-muted-foreground mt-1 text-sm md:text-base">
              Dicas, novidades e inspirações
            </p>
          </div>
          <Link
            to="/blog"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Ver todos
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Loading skeleton */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[16/10] bg-muted rounded-xl mb-4" />
                <div className="h-4 bg-muted rounded w-24 mb-3" />
                <div className="h-5 bg-muted rounded w-3/4 mb-2" />
                <div className="h-4 bg-muted rounded w-full" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Desktop: Grid */}
            <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {visiblePosts.map((post) => (
                <BlogCard key={post.id} post={post} />
              ))}
            </div>

            {/* Mobile: Horizontal scroll */}
            <div className="sm:hidden -mx-4 px-4">
              <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4">
                {visiblePosts.map((post) => (
                  <div
                    key={post.id}
                    className="flex-shrink-0 w-[280px] snap-start"
                  >
                    <BlogCard post={post} />
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile "Ver todos" */}
            <div className="sm:hidden mt-6 text-center">
              <Link
                to="/blog"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Ver todos os artigos
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

interface BlogCardProps {
  post: {
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    featured_image_url: string | null;
    published_at: string | null;
    author_name: string | null;
    category_tag: string | null;
  };
}

function BlogCard({ post }: BlogCardProps) {
  const imageUrl = post.featured_image_url
    ? resolveImageUrl(post.featured_image_url)
    : null;

  const formattedDate = post.published_at
    ? format(new Date(post.published_at), "d 'de' MMM, yyyy", { locale: ptBR })
    : null;

  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group block rounded-xl overflow-hidden bg-card border border-border/50 hover:border-primary/30 hover:shadow-lg transition-all duration-300"
    >
      {/* Image */}
      <div className="aspect-[16/10] overflow-hidden bg-muted">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={post.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 md:p-5">
        {/* Category tag */}
        {post.category_tag && (
          <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-primary mb-2">
            {post.category_tag}
          </span>
        )}

        {/* Title */}
        <h3 className="font-semibold text-foreground text-base leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {post.title}
        </h3>

        {/* Excerpt */}
        {post.excerpt && (
          <p className="text-muted-foreground text-sm mt-2 line-clamp-2">
            {post.excerpt}
          </p>
        )}

        {/* Meta */}
        <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
          {formattedDate && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formattedDate}
            </span>
          )}
          {post.author_name && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {post.author_name}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default BlogSection;

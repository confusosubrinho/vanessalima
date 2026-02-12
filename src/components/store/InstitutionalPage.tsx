import { StoreLayout } from '@/components/store/StoreLayout';
import { usePageContent } from '@/hooks/usePageContent';
import { Skeleton } from '@/components/ui/skeleton';

interface InstitutionalPageProps {
  slug: string;
  fallbackTitle?: string;
}

export function InstitutionalPage({ slug, fallbackTitle }: InstitutionalPageProps) {
  const { data: page, isLoading } = usePageContent(slug);

  return (
    <StoreLayout>
      <div className="container-custom py-12">
        <div className="max-w-3xl mx-auto">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : page?.content ? (
            <>
              <h1 className="text-3xl font-bold mb-6">{page.page_title}</h1>
              <div
                className="prose prose-sm max-w-none text-muted-foreground [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-8 [&_h2]:mb-3 [&_p]:mb-4 [&_strong]:text-foreground [&_ul]:space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:space-y-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_details]:border [&_details]:rounded-lg [&_details]:px-4 [&_summary]:py-4 [&_summary]:font-medium [&_summary]:cursor-pointer [&_details>p]:pb-4"
                dangerouslySetInnerHTML={{ __html: page.content }}
              />
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold mb-6">{fallbackTitle || 'Página'}</h1>
              <p className="text-muted-foreground">
                Conteúdo ainda não configurado. Acesse o painel admin para editar esta página.
              </p>
            </>
          )}
        </div>
      </div>
    </StoreLayout>
  );
}

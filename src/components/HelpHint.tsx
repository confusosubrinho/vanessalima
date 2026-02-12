import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { useHelpArticle } from '@/hooks/useHelpArticle';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface HelpHintProps {
  helpKey: string;
  variant?: 'icon' | 'link';
  className?: string;
  size?: 'sm' | 'md';
}

function renderMarkdown(md: string) {
  // Simple markdown renderer for help content
  const lines = md.split('\n');
  const elements: JSX.Element[] = [];
  let key = 0;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      elements.push(<h2 key={key++} className="text-lg font-semibold mt-4 mb-2">{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={key++} className="text-base font-medium mt-3 mb-1">{line.slice(4)}</h3>);
    } else if (line.startsWith('- ')) {
      elements.push(
        <li key={key++} className="ml-4 list-disc text-sm text-muted-foreground">
          {renderInline(line.slice(2))}
        </li>
      );
    } else if (line.startsWith('⚠️')) {
      elements.push(
        <p key={key++} className="text-sm bg-warning/10 text-warning-foreground p-2 rounded mt-2">
          {renderInline(line)}
        </p>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={key++} className="h-1" />);
    } else {
      elements.push(<p key={key++} className="text-sm text-muted-foreground">{renderInline(line)}</p>);
    }
  }

  return <div className="space-y-0.5">{elements}</div>;
}

function renderInline(text: string) {
  // Handle **bold** and inline formatting
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export function HelpHint({ helpKey, variant = 'icon', className, size = 'sm' }: HelpHintProps) {
  const [open, setOpen] = useState(false);
  const { data: article, isLoading } = useHelpArticle(helpKey);

  const tooltipText = article
    ? article.content.split('\n').filter(l => l.trim() && !l.startsWith('#')).slice(0, 2).join(' ').replace(/\*\*/g, '').slice(0, 120) + '…'
    : 'Clique para ver ajuda';

  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  if (variant === 'link') {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className={cn('text-xs text-primary hover:underline inline-flex items-center gap-1', className)}
        >
          <HelpCircle className="h-3 w-3" />
          Ajuda
        </button>
        <HelpSheet open={open} onOpenChange={setOpen} article={article} isLoading={isLoading} />
      </>
    );
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-6 w-6 rounded-full text-muted-foreground hover:text-primary', className)}
            onClick={() => setOpen(true)}
          >
            <HelpCircle className={iconSize} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
      <HelpSheet open={open} onOpenChange={setOpen} article={article} isLoading={isLoading} />
    </>
  );
}

function HelpSheet({ open, onOpenChange, article, isLoading }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  article: any;
  isLoading: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            {isLoading ? 'Carregando...' : article?.title || 'Ajuda'}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
              <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
              <div className="h-4 bg-muted rounded w-5/6 animate-pulse" />
            </div>
          ) : article ? (
            renderMarkdown(article.content)
          ) : (
            <div className="text-center py-8">
              <HelpCircle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Ajuda ainda não cadastrada para esta seção.
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

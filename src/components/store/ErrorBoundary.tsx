import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
          <h1 className="text-xl font-semibold text-foreground mb-2">Algo deu errado</h1>
          <p className="text-muted-foreground mb-6 max-w-md">
            Ocorreu um erro inesperado. Recarregue a página para tentar novamente.
          </p>
          {isDev && this.state.error && (
            <pre className="text-left text-xs bg-muted p-4 rounded mb-4 max-w-full overflow-auto max-h-40">
              {this.state.error.message}
            </pre>
          )}
          <Button onClick={this.handleReload}>Recarregar página</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

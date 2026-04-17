import * as React from 'react';
import { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  constructor(props: Props) {
    super(props);
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    window.location.reload();
  };

  public render() {
    const { hasError, error } = this.state;
    const { children } = (this as any).props;

    if (hasError) {
      let errorMessage = 'Ocorreu um erro inesperado no aplicativo.';
      
      try {
        if (error?.message) {
          const parsed = JSON.parse(error.message);
          if (parsed.operationType) {
            errorMessage = `Erro de Permissão: Você não tem permissão para esta operação (${parsed.operationType}).`;
          }
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
          <div className="max-w-md w-full bg-white p-8 rounded-[32px] shadow-2xl text-center space-y-6 border border-red-100">
            <div className="w-20 h-20 bg-red-50 text-red-500 rounded-3xl mx-auto flex items-center justify-center">
              <AlertTriangle size={40} />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black tracking-tighter">Ops! Algo deu errado.</h2>
              <p className="text-gray-500 text-sm">{errorMessage}</p>
            </div>
            <button
              onClick={this.handleReset}
              className="w-full bg-black text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 transition-all shadow-xl shadow-black/20"
            >
              <RefreshCw size={20} />
              Recarregar Aplicativo
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}

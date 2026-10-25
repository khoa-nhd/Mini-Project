import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (type: Toast['type'], message: string, duration?: number) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((type: Toast['type'], message: string, duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message, duration }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const handleCustomToast = (e: Event) => {
      const customEvent = e as CustomEvent<{ type: Toast['type']; message: string; duration?: number }>;
      if (customEvent.detail) {
        showToast(customEvent.detail.type, customEvent.detail.message, customEvent.detail.duration);
      }
    };
    window.addEventListener('quicknotes:toast', handleCustomToast);
    return () => window.removeEventListener('quicknotes:toast', handleCustomToast);
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      <div className="absolute md:fixed top-4 right-4 left-4 sm:left-auto sm:right-4 z-50 flex flex-col items-end gap-2 pointer-events-none" aria-live="polite">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  };
  const Icon = icons[toast.type];

  // Flat card on the semantic palette; only the icon carries the status color
  const baseStyles = 'card flex items-center gap-3 px-4 py-3 w-full sm:w-auto sm:min-w-[280px] max-w-md pointer-events-auto animate-in slide-in-right';
  const iconStyles = {
    success: 'text-primary',
    error: 'text-destructive',
    warning: 'text-accent',
    info: 'text-primary',
  };

  return (
    <div className={baseStyles} role={toast.type === 'error' ? 'alert' : 'status'}>
      <Icon className={cn('w-5 h-5 flex-shrink-0', iconStyles[toast.type])} />
      <p className="flex-1 text-sm text-foreground">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="toolbar-btn flex-shrink-0 p-1"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
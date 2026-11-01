'use client';
import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

let addToastFn: ((type: ToastType, message: string) => void) | null = null;

export function toast(type: ToastType, message: string) {
  if (addToastFn) addToastFn(type, message);
}

const icons = { success: CheckCircle, error: XCircle, warning: AlertTriangle, info: Info };
const styles = {
  success: 'border-green-400/20 bg-green-400/10',
  error: 'border-red-400/20 bg-red-400/10',
  warning: 'border-yellow-400/20 bg-yellow-400/10',
  info: 'border-blue-400/20 bg-blue-400/10',
};
const iconColors = { success: 'text-green-400', error: 'text-red-400', warning: 'text-yellow-400', info: 'text-blue-400' };

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    addToastFn = (type: ToastType, message: string) => {
      const id = Math.random().toString(36).slice(2);
      setToasts(prev => [...prev, { id, type, message }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    };
    return () => { addToastFn = null; };
  }, []);

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(t => {
        const Icon = icons[t.type];
        return (
          <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${styles[t.type]} shadow-lg animate-in slide-in-from-right`}>
            <Icon className={`w-5 h-5 ${iconColors[t.type]}`} />
            <p className="text-sm flex-1">{t.message}</p>
            <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className="text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

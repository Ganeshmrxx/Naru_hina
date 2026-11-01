import { Loader2 } from 'lucide-react';

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      <p className="text-sm text-gray-400 mt-3">{message}</p>
    </div>
  );
}

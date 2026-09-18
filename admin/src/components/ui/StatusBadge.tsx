interface StatusBadgeProps {
  status: string;
  label?: string;
}

const statusStyles: Record<string, string> = {
  online: 'bg-green-400/10 text-green-400 border-green-400/20',
  offline: 'bg-gray-400/10 text-gray-400 border-gray-400/20',
  warning: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20',
  error: 'bg-red-400/10 text-red-400 border-red-400/20',
  pending: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
  running: 'bg-green-400/10 text-green-400 border-green-400/20',
  done: 'bg-gray-400/10 text-gray-400 border-gray-400/20',
  notnow: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20',
  queued: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  in_progress: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
  completed: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
  removed_restricted: 'bg-rose-400/10 text-rose-400 border-rose-400/20',
};

const dotStyles: Record<string, string> = {
  online: 'bg-green-400',
  offline: 'bg-gray-400',
  warning: 'bg-yellow-400',
  error: 'bg-red-400',
  pending: 'bg-blue-400',
  running: 'bg-green-400',
  done: 'bg-gray-400',
  notnow: 'bg-yellow-400',
  queued: 'bg-amber-400',
  in_progress: 'bg-blue-400 animate-pulse',
  completed: 'bg-emerald-400',
  removed_restricted: 'bg-rose-400',
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${statusStyles[status] || statusStyles.offline}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[status] || dotStyles.offline}`} />
      {label || status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

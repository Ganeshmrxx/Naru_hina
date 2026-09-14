interface StatusBadgeProps {
  status: 'online' | 'offline' | 'warning' | 'error' | 'pending' | 'running' | 'done' | 'notnow';
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
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${statusStyles[status] || statusStyles.offline}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[status] || dotStyles.offline}`} />
      {label || status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

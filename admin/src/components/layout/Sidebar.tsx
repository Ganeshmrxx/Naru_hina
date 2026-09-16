'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, ArrowRightLeft, Bot, Database, BarChart3,
  ScrollText, AlertCircle, Radio, Film, Zap, Megaphone,
  HardDrive, Settings, LogOut, Hash
} from 'lucide-react';
import { logout } from '@/lib/auth';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { type: 'divider', label: 'Telegram Forwarding' },
  { name: 'Forwarding', href: '/forwarding', icon: ArrowRightLeft },
  { name: 'Bulk Forward', href: '/forwarding/bulk', icon: HardDrive },
  { name: 'Forward Jobs', href: '/forwarding/jobs', icon: Radio },
  { type: 'divider', label: 'Bots' },
  { name: 'All Bots', href: '/bots', icon: Bot },
  { name: 'Movie Forwarder', href: '/bots/movie-forwarder', icon: Film },
  { name: 'TeraBox Modifier', href: '/bots/terabox', icon: Zap },
  { name: 'Promoter 1', href: '/bots/promoter-1', icon: Megaphone },
  { name: 'Promoter 2', href: '/bots/promoter-2', icon: Megaphone },
  { name: 'Backup Forwarder', href: '/bots/backup-forwarder', icon: HardDrive },
  { name: 'Data Modifier', href: '/bots/data-modifier', icon: Settings },
  { type: 'divider', label: 'Data' },
  { name: 'Channels', href: '/channels', icon: Hash },
  { name: 'Media Gallery', href: '/media', icon: Film },
  { name: 'Database', href: '/database', icon: Database },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { type: 'divider', label: 'Monitoring' },
  { name: 'Live Logs', href: '/logs', icon: ScrollText },
  { name: 'Errors', href: '/errors', icon: AlertCircle },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-[#0d1117] border-r border-[#1f2937] flex flex-col z-40">
      <div className="p-5 border-b border-[#1f2937]">
        <h1 className="text-xl font-bold">
          <span className="text-blue-400">All</span>Forward
        </h1>
        <p className="text-xs text-gray-500 mt-1">Admin Control Panel</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {navigation.map((item, i) => {
          if ('type' in item && item.type === 'divider') {
            return <p key={i} className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold mt-5 mb-2 px-3">{item.label}</p>;
          }
          if (!('href' in item)) return null;
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 ${
                isActive
                  ? 'bg-blue-500/10 text-blue-400 font-medium'
                  : 'text-gray-400 hover:text-white hover:bg-[#1f2937]'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[#1f2937]">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-red-400/10 w-full transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}

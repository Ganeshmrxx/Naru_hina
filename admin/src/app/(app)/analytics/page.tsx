'use client';

import { useState, useEffect } from 'react';
import {
  BarChart3, Calendar, RefreshCw, ArrowRightLeft, Video, Image,
  HardDrive, TrendingUp
} from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { api } from '@/lib/api';

export default function AnalyticsPage() {
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = async () => {
    try {
      const data = await api.getStatsHistory(days);
      setHistory(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [days]);

  if (loading) return <LoadingState message="Loading historical forwarding metrics..." />;

  // Aggregates
  const totalMediaAll = history.reduce((acc, curr) => acc + ((curr.total_media as number) || 0), 0);
  const totalVideosAll = history.reduce((acc, curr) => acc + ((curr.videos as number) || 0), 0);
  const totalPhotosAll = history.reduce((acc, curr) => acc + ((curr.photos as number) || 0), 0);
  const totalSizeBytes = history.reduce((acc, curr) => acc + ((curr.total_size as number) || 0), 0);
  const totalSizeMB = Math.round(totalSizeBytes / (1024 * 1024));

  // Max for relative bar scaling
  const maxMedia = Math.max(...history.map((h) => (h.total_media as number) || 1), 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Forwarding Analytics & Trends</h1>
          <p className="text-sm text-gray-400 mt-1">
            Historical media volume processed across the Telegram network (<code className="text-blue-300">daily_summary</code>)
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1 bg-[#111827] p-1 border border-[#1f2937] rounded-lg text-xs">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded font-medium transition-colors ${
                  days === d ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {d} Days
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              setRefreshing(true);
              fetchHistory();
            }}
            disabled={refreshing}
            className="p-2 rounded-lg bg-[#111827] border border-[#1f2937] text-gray-400 hover:text-white"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Aggregate Cards for Period */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={`Total Media (${days}d)`}
          value={totalMediaAll.toLocaleString()}
          icon={ArrowRightLeft}
          color="blue"
          subtitle="Processed & copied"
        />
        <StatCard
          title={`Videos (${days}d)`}
          value={totalVideosAll.toLocaleString()}
          icon={Video}
          color="purple"
          subtitle="Video streams forwarded"
        />
        <StatCard
          title={`Photos (${days}d)`}
          value={totalPhotosAll.toLocaleString()}
          icon={Image}
          color="yellow"
          subtitle="Photos & thumbnails"
        />
        <StatCard
          title={`Total Data (${days}d)`}
          value={totalSizeMB > 1024 ? `${(totalSizeMB / 1024).toFixed(2)} GB` : `${totalSizeMB} MB`}
          icon={HardDrive}
          color="green"
          subtitle="Bandwidth transferred"
        />
      </div>

      {/* Visual Activity Bars */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-6 space-y-4">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          Daily Media Transfer Activity
        </h2>

        {history.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No Analytics Recorded Yet"
            description="Daily summary statistics will populate automatically as channels are scanned."
          />
        ) : (
          <div className="space-y-3 pt-2">
            {history.map((day, idx) => {
              const dateStr = day.date as string;
              const count = (day.total_media as number) || 0;
              const vCount = (day.videos as number) || 0;
              const pCount = (day.photos as number) || 0;
              const percentage = Math.round((count / maxMedia) * 100);

              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-gray-300 font-semibold">{dateStr}</span>
                    <span className="text-gray-400">
                      {count.toLocaleString()} items ({vCount} videos, {pCount} photos)
                    </span>
                  </div>
                  <div className="w-full bg-[#0d1117] h-3 rounded-full overflow-hidden flex border border-[#1f2937]/50">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(percentage, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Historical Records Table */}
      {history.length > 0 && (
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl overflow-hidden shadow-lg">
          <div className="p-4 border-b border-[#1f2937]">
            <h3 className="font-semibold text-white text-sm">Summary Log Table</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0d1117] text-gray-400 uppercase tracking-wider font-semibold border-b border-[#1f2937]">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Total Media</th>
                  <th className="py-3 px-4">Videos</th>
                  <th className="py-3 px-4">Photos</th>
                  <th className="py-3 px-4">Total Size (MB)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f2937]">
                {history.map((day, idx) => {
                  const sizeBytes = (day.total_size as number) || 0;
                  const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);

                  return (
                    <tr key={idx} className="hover:bg-[#1f2937]/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-white">{day.date as string}</td>
                      <td className="py-3 px-4 font-mono text-blue-400 font-semibold">
                        {(day.total_media as number || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono text-purple-400">
                        {(day.videos as number || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono text-yellow-400">
                        {(day.photos as number || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono text-green-400">{sizeMB} MB</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

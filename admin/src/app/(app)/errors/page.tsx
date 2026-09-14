'use client';

import { useState, useEffect } from 'react';
import {
  AlertCircle, AlertTriangle, RefreshCw, ShieldCheck,
  CheckCircle2, Info, ExternalLink
} from 'lucide-react';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { api } from '@/lib/api';

const ERROR_RECOVERY_GUIDE: Record<string, { title: string; explanation: string; remedy: string }> = {
  FloodWait: {
    title: 'Telegram Rate Limit (FloodWait)',
    explanation: 'Telegram is throttling rapid API requests to protect network integrity.',
    remedy: 'The bot automatically sleeps for the required number of seconds. Do not force restart.'
  },
  AUTH_KEY_DUPLICATED: {
    title: 'Duplicate Session Key',
    explanation: 'The same Pyrogram session string is running on multiple hosts simultaneously.',
    remedy: 'Stop any other instances running locally or on another server using the same session.'
  },
  FROZEN_METHOD_INVALID: {
    title: 'Telegram Account Temporary Restriction',
    explanation: 'Telegram has applied a temporary freeze on channel creation or member additions.',
    remedy: 'Wait 24 hours for the Telegram automated flag to clear. Avoid spamming requests.'
  },
  CHAT_ID_INVALID: {
    title: 'Invalid or Inaccessible Chat ID',
    explanation: 'The userbot or bot is not a participant in the specified chat ID.',
    remedy: 'Ensure the bot account has joined the channel or group before initiating operations.'
  },
  Forbidden: {
    title: 'Permission Denied / Banned',
    explanation: 'The bot account has been kicked or does not possess admin rights.',
    remedy: 'Grant administrator permissions or promote @ganeshmrxx inside the target chat.'
  }
};

export default function ErrorsPage() {
  const [errors, setErrors] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchErrors = async () => {
    try {
      const data = await api.getErrors(50);
      setErrors(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchErrors();
    const interval = setInterval(fetchErrors, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <LoadingState message="Scanning error registry..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Error Monitoring & Diagnostics</h1>
          <p className="text-sm text-gray-400 mt-1">
            Real-time tracking of Telegram RPC exceptions, network timeouts, and database failures
          </p>
        </div>
        <button
          onClick={() => {
            setRefreshing(true);
            fetchErrors();
          }}
          disabled={refreshing}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#111827] border border-[#1f2937] text-sm text-gray-300 hover:text-white hover:bg-[#1f2937] transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Telegram Error Knowledge Base Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(ERROR_RECOVERY_GUIDE).slice(0, 3).map(([key, item]) => (
          <div key={key} className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 space-y-2">
            <h3 className="font-semibold text-white text-xs flex items-center gap-1.5">
              <Info className="w-4 h-4 text-blue-400" />
              {item.title}
            </h3>
            <p className="text-[11px] text-gray-400 leading-relaxed">{item.explanation}</p>
            <div className="pt-1 text-[11px] text-yellow-300 font-medium">
              Fix: {item.remedy}
            </div>
          </div>
        ))}
      </div>

      {/* Errors Table */}
      {errors.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Zero Errors Detected"
          description="The bot cluster and MongoDB connections are operating smoothly with no recent exceptions."
        />
      ) : (
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl overflow-hidden shadow-lg">
          <div className="p-4 border-b border-[#1f2937] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              Recent Logged Exceptions
            </h2>
            <span className="text-xs text-red-400 font-mono font-medium">
              {errors.length} incidents recorded
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0d1117] text-gray-400 uppercase tracking-wider font-semibold border-b border-[#1f2937]">
                <tr>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Bot</th>
                  <th className="py-3 px-4">Level</th>
                  <th className="py-3 px-4">Exception Message</th>
                  <th className="py-3 px-4">Diagnostic Tip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f2937]">
                {errors.map((err, idx) => {
                  const timestamp = new Date(err.timestamp as string).toLocaleTimeString();
                  const botId = (err.bot_id as string) || 'system';
                  const msg = (err.message as string) || '';

                  // Check for diagnostic tip
                  let tip = 'Review bot logs for full stack trace';
                  for (const [key, guide] of Object.entries(ERROR_RECOVERY_GUIDE)) {
                    if (msg.includes(key)) {
                      tip = guide.remedy;
                      break;
                    }
                  }

                  return (
                    <tr key={idx} className="hover:bg-[#1f2937]/30 transition-colors">
                      <td className="py-3 px-4 font-mono text-gray-400 whitespace-nowrap">{timestamp}</td>
                      <td className="py-3 px-4 font-mono text-purple-400 font-semibold">{botId}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                          ERROR
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-red-300 break-all max-w-md">{msg}</td>
                      <td className="py-3 px-4 text-gray-400 text-[11px]">{tip}</td>
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

'use client';

import { useState } from 'react';
import {
  Key, Check, Copy, ShieldCheck, AlertCircle, ArrowRight,
  Lock, Phone, RefreshCw, X, User, Sparkles, HelpCircle, HardDrive
} from 'lucide-react';
import { toast } from './Toast';
import { api } from '@/lib/api';

interface SessionGeneratorModalProps {
  open: boolean;
  onClose: () => void;
  defaultTargetBot?: 'movie_forwarder' | 'backup_forwarder';
  onSessionApplied?: () => void;
}

export function SessionGeneratorModal({
  open,
  onClose,
  defaultTargetBot = 'backup_forwarder',
  onSessionApplied,
}: SessionGeneratorModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);

  // Step 1 state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [apiId, setApiId] = useState('27672711');
  const [apiHash, setApiHash] = useState('4e7aaf6a6b0ddcb00e05e9234e2e84dd');

  // Step 2 state
  const [authId, setAuthId] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [password, setPassword] = useState('');
  const [needPassword, setNeedPassword] = useState(false);

  // Step 3 state
  const [sessionString, setSessionString] = useState('');
  const [userInfo, setUserInfo] = useState<{
    id: number;
    first_name: string;
    username?: string;
    phone_number?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const resetAll = () => {
    setStep(1);
    setPhoneNumber('');
    setPhoneCode('');
    setPassword('');
    setNeedPassword(false);
    setSessionString('');
    setUserInfo(null);
    setCopied(false);
    setLoading(false);
    setApplying(null);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phoneNumber.trim();
    if (!cleanPhone) {
      toast('warning', 'Please enter your Telegram phone number');
      return;
    }

    setLoading(true);
    try {
      const res = await api.sendTelegramSessionCode({
        phone_number: cleanPhone,
        api_id: apiId ? parseInt(apiId) : undefined,
        api_hash: apiHash || undefined,
      });
      setAuthId(res.auth_id);
      setStep(2);
      toast('success', res.message || 'Verification code sent to Telegram app!');
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneCode.trim()) {
      toast('warning', 'Please enter the verification code');
      return;
    }

    setLoading(true);
    try {
      const res = await api.verifyTelegramSessionCode({
        auth_id: authId,
        phone_code: phoneCode.trim(),
        password: password.trim() || undefined,
      });

      if (res.need_password) {
        setNeedPassword(true);
        toast('warning', 'Two-Step Verification (2FA) password is required for this account.');
        setLoading(false);
        return;
      }

      if (res.session_string) {
        setSessionString(res.session_string);
        setUserInfo(res.user || null);
        setStep(3);
        toast('success', 'New String Session successfully generated!');
      }
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!sessionString) return;
    navigator.clipboard.writeText(sessionString);
    setCopied(true);
    toast('success', 'String Session copied to clipboard!');
    setTimeout(() => setCopied(false), 3000);
  };

  const handleApply = async (botId: 'movie_forwarder' | 'backup_forwarder') => {
    if (!sessionString) return;
    setApplying(botId);
    try {
      const res = await api.applyTelegramSession({
        target_bot: botId,
        session_string: sessionString,
      });
      toast('success', res.message || `Applied to ${botId} and restarted!`);
      if (onSessionApplied) onSessionApplied();
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to apply session');
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#111827] border border-[#1f2937] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#1f2937] bg-gradient-to-r from-blue-900/20 via-[#111827] to-indigo-900/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Telegram String Session Generator
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Generate and apply fresh Pyrogram sessions via Web UI
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1f2937] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-between px-6 py-3 bg-[#0d1117] border-b border-[#1f2937] text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                step >= 1 ? 'bg-blue-600 text-white' : 'bg-[#1f2937] text-gray-500'
              }`}
            >
              1
            </span>
            <span className={step === 1 ? 'text-white font-medium' : 'text-gray-400'}>Phone</span>
          </div>

          <div className="w-8 h-px bg-[#1f2937]" />

          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                step >= 2 ? 'bg-blue-600 text-white' : 'bg-[#1f2937] text-gray-500'
              }`}
            >
              2
            </span>
            <span className={step === 2 ? 'text-white font-medium' : 'text-gray-400'}>OTP / 2FA</span>
          </div>

          <div className="w-8 h-px bg-[#1f2937]" />

          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                step === 3 ? 'bg-emerald-600 text-white' : 'bg-[#1f2937] text-gray-500'
              }`}
            >
              3
            </span>
            <span className={step === 3 ? 'text-white font-medium' : 'text-gray-400'}>Done</span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {/* STEP 1: Phone Number */}
          {step === 1 && (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-blue-400" />
                  Telegram Phone Number
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="+919876543210"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full bg-[#0d1117] border border-[#1f2937] rounded-xl px-4 py-2.5 text-sm font-mono text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-all"
                    required
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Include country code with <code className="text-blue-300">+</code> (e.g. +91 for India, +1 for USA).
                </p>
              </div>

              {/* Advanced Toggle */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  {showAdvanced ? 'Hide API credentials' : 'Custom API ID / Hash (Optional)'}
                </button>

                {showAdvanced && (
                  <div className="mt-3 p-3 bg-[#0d1117] border border-[#1f2937] rounded-xl space-y-3 animate-in fade-in">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-400 mb-1">API ID</label>
                      <input
                        type="text"
                        value={apiId}
                        onChange={(e) => setApiId(e.target.value)}
                        className="w-full bg-[#111827] border border-[#1f2937] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-400 mb-1">API Hash</label>
                      <input
                        type="text"
                        value={apiHash}
                        onChange={(e) => setApiHash(e.target.value)}
                        className="w-full bg-[#111827] border border-[#1f2937] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-xl bg-[#0d1117] border border-[#1f2937] text-xs font-medium text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !phoneNumber.trim()}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Sending OTP...
                    </>
                  ) : (
                    <>
                      Send Login Code
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Verify Code & 2FA */}
          {step === 2 && (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300">
                A verification code has been sent to your official Telegram app for <span className="font-mono font-bold text-white">{phoneNumber}</span>.
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Telegram Login Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. 12345"
                  value={phoneCode}
                  onChange={(e) => setPhoneCode(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#1f2937] rounded-xl px-4 py-2.5 text-sm font-mono tracking-widest text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-all text-center"
                  required
                  autoFocus
                />
              </div>

              {/* 2FA Password Field */}
              {(needPassword || true) && (
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      2-Step Verification Password
                    </span>
                    {!needPassword && <span className="text-[10px] text-gray-500 font-normal">(Only if enabled)</span>}
                  </label>
                  <input
                    type="password"
                    placeholder="Your 2FA cloud password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`w-full bg-[#0d1117] border rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none transition-all ${
                      needPassword
                        ? 'border-amber-500/50 focus:border-amber-400 ring-1 ring-amber-500/20'
                        : 'border-[#1f2937] focus:border-blue-500'
                    }`}
                  />
                  {needPassword && (
                    <p className="text-[11px] text-amber-400 mt-1">
                      Two-Step Verification is active on this account. Please enter your cloud password.
                    </p>
                  )}
                </div>
              )}

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  &larr; Change Phone Number
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 rounded-xl bg-[#0d1117] border border-[#1f2937] text-xs font-medium text-gray-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !phoneCode.trim()}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        Verify & Generate
                        <Sparkles className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* STEP 3: String Session Created! */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Account Info Banner */}
              {userInfo && (
                <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-white block">
                      {userInfo.first_name} {userInfo.username ? `(@${userInfo.username})` : ''}
                    </span>
                    <span className="text-emerald-400 font-mono text-[11px]">
                      ID: {userInfo.id} | {userInfo.phone_number || phoneNumber}
                    </span>
                  </div>
                </div>
              )}

              {/* String Session Area */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-blue-400" />
                    Pyrogram String Session:
                  </label>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  readOnly
                  rows={4}
                  value={sessionString}
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  className="w-full bg-[#0d1117] border border-[#1f2937] rounded-xl p-3 text-xs font-mono text-gray-300 focus:outline-none focus:border-blue-500 break-all resize-none selection:bg-blue-600/30"
                />
              </div>

              {/* 1-Click Apply Buttons */}
              <div className="bg-[#0d1117] border border-[#1f2937] rounded-xl p-4 space-y-3">
                <span className="text-xs font-semibold text-white block flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  1-Click Apply to Bot & Restart:
                </span>
                <p className="text-[11px] text-gray-400">
                  Click below to instantly update the bot configuration and restart it with this new session:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => handleApply('backup_forwarder')}
                    disabled={applying !== null}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-semibold transition-all disabled:opacity-50"
                  >
                    {applying === 'backup_forwarder' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                    )}
                    Apply to Backup Forwarder (SESSION2)
                  </button>

                  <button
                    onClick={() => handleApply('movie_forwarder')}
                    disabled={applying !== null}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 text-xs font-semibold transition-all disabled:opacity-50"
                  >
                    {applying === 'movie_forwarder' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Key className="w-3.5 h-3.5 text-purple-400" />
                    )}
                    Apply to Movie Forwarder (SESSION1)
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleClose}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white transition-all shadow-lg"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

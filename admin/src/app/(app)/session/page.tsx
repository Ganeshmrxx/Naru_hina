'use client';

import { useState } from 'react';
import {
  Key, ShieldCheck, Phone, Lock, Sparkles, Check, Copy,
  ArrowRight, RefreshCw, User, HelpCircle, HardDrive, AlertTriangle
} from 'lucide-react';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

export default function SessionGeneratorPage() {
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
        toast('warning', 'Two-Step Verification (2FA) password is required.');
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
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to apply session');
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <Key className="w-6 h-6 text-blue-400" />
          Telegram String Session Generator
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Create fresh Pyrogram string sessions and apply them to userbots directly from the UI
        </p>
      </div>

      {/* Info Callout */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3 text-xs text-blue-300">
        <ShieldCheck className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-white">Safe & In-Memory Authentication:</span>
          <p className="mt-0.5 text-gray-300">
            Login is processed directly via Telegram MTProto. Once the string session is generated, you can copy it or apply it to fix <code className="text-blue-200">AUTH_KEY_DUPLICATED</code> errors instantly.
          </p>
        </div>
      </div>

      {/* Wizard Card */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-2xl shadow-xl overflow-hidden">
        {/* Step Indicator Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#0d1117] border-b border-[#1f2937] text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                step >= 1 ? 'bg-blue-600 text-white' : 'bg-[#1f2937] text-gray-500'
              }`}
            >
              1
            </span>
            <div>
              <span className={`block font-medium ${step === 1 ? 'text-white' : 'text-gray-400'}`}>Phone Number</span>
              <span className="text-[10px] text-gray-500">Enter Telegram Phone</span>
            </div>
          </div>

          <div className="w-12 h-px bg-[#1f2937]" />

          <div className="flex items-center gap-2">
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                step >= 2 ? 'bg-blue-600 text-white' : 'bg-[#1f2937] text-gray-500'
              }`}
            >
              2
            </span>
            <div>
              <span className={`block font-medium ${step === 2 ? 'text-white' : 'text-gray-400'}`}>Verify OTP</span>
              <span className="text-[10px] text-gray-500">Telegram Code & 2FA</span>
            </div>
          </div>

          <div className="w-12 h-px bg-[#1f2937]" />

          <div className="flex items-center gap-2">
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                step === 3 ? 'bg-emerald-600 text-white' : 'bg-[#1f2937] text-gray-500'
              }`}
            >
              3
            </span>
            <div>
              <span className={`block font-medium ${step === 3 ? 'text-white' : 'text-gray-400'}`}>Session Ready</span>
              <span className="text-[10px] text-gray-500">Copy & Apply</span>
            </div>
          </div>
        </div>

        {/* Card Body */}
        <div className="p-6 sm:p-8">
          {/* STEP 1: Phone */}
          {step === 1 && (
            <form onSubmit={handleSendCode} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-2 flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-blue-400" />
                  Your Telegram Phone Number
                </label>
                <input
                  type="text"
                  placeholder="+919876543210"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#1f2937] rounded-xl px-4 py-3 text-sm font-mono text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-all"
                  required
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-2">
                  Make sure to include your country code with <code className="text-blue-300 font-mono">+</code> (e.g. +91 for India).
                </p>
              </div>

              {/* Custom API Credentials Toggle */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  {showAdvanced ? 'Hide Custom API Credentials' : 'Use Custom API ID & Hash (Optional)'}
                </button>

                {showAdvanced && (
                  <div className="mt-3 p-4 bg-[#0d1117] border border-[#1f2937] rounded-xl space-y-3">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-400 mb-1">API ID</label>
                      <input
                        type="text"
                        value={apiId}
                        onChange={(e) => setApiId(e.target.value)}
                        className="w-full bg-[#111827] border border-[#1f2937] rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-400 mb-1">API Hash</label>
                      <input
                        type="text"
                        value={apiHash}
                        onChange={(e) => setApiHash(e.target.value)}
                        className="w-full bg-[#111827] border border-[#1f2937] rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={loading || !phoneNumber.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Connecting to Telegram...
                    </>
                  ) : (
                    <>
                      Send Login Code
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Verify Code */}
          {step === 2 && (
            <form onSubmit={handleVerifyCode} className="space-y-5">
              <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300">
                A login code was sent to your Telegram app for <span className="font-mono font-bold text-white">{phoneNumber}</span>. Open Telegram to check the code.
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Enter Telegram Login Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. 12345"
                  value={phoneCode}
                  onChange={(e) => setPhoneCode(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#1f2937] rounded-xl px-4 py-3 text-base font-mono tracking-widest text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-center transition-all"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-amber-400" />
                    Two-Step Verification (2FA) Password
                  </span>
                  {!needPassword && <span className="text-[10px] text-gray-500 font-normal">(Only if enabled)</span>}
                </label>
                <input
                  type="password"
                  placeholder="Your 2FA cloud password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full bg-[#0d1117] border rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none transition-all ${
                    needPassword
                      ? 'border-amber-500/50 focus:border-amber-400 ring-1 ring-amber-500/20'
                      : 'border-[#1f2937] focus:border-blue-500'
                  }`}
                />
                {needPassword && (
                  <p className="text-xs text-amber-400 mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Two-Step Verification password is required to complete login.
                  </p>
                )}
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  &larr; Re-enter Phone Number
                </button>

                <button
                  type="submit"
                  disabled={loading || !phoneCode.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Generating Session...
                    </>
                  ) : (
                    <>
                      Verify & Generate String Session
                      <Sparkles className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: Complete */}
          {step === 3 && (
            <div className="space-y-6">
              {/* Account profile card */}
              {userInfo && (
                <div className="flex items-center gap-3.5 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-base text-white block">
                      {userInfo.first_name} {userInfo.username ? `(@${userInfo.username})` : ''}
                    </span>
                    <span className="text-emerald-400 font-mono text-xs">
                      User ID: {userInfo.id} | Phone: {userInfo.phone_number || phoneNumber}
                    </span>
                  </div>
                </div>
              )}

              {/* String session text area */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                    <Key className="w-4 h-4 text-blue-400" />
                    Generated Pyrogram String Session:
                  </label>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        Copied to Clipboard!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy String Session
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  readOnly
                  rows={5}
                  value={sessionString}
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  className="w-full bg-[#0d1117] border border-[#1f2937] rounded-xl p-3.5 text-xs font-mono text-gray-300 focus:outline-none focus:border-blue-500 break-all resize-none"
                />
              </div>

              {/* 1-Click Apply to Bot Card */}
              <div className="bg-[#0d1117] border border-[#1f2937] rounded-xl p-5 space-y-3">
                <span className="text-sm font-bold text-white block flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  One-Click Apply & Restart Bot:
                </span>
                <p className="text-xs text-gray-400">
                  Select which bot you want to update with this new session. The session will be saved to disk and the bot will restart automatically:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => handleApply('backup_forwarder')}
                    disabled={applying !== null}
                    className="flex items-center justify-center gap-2 p-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-semibold transition-all disabled:opacity-50"
                  >
                    {applying === 'backup_forwarder' ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <HardDrive className="w-4 h-4 text-blue-400" />
                    )}
                    Apply to Backup Forwarder (SESSION2)
                  </button>

                  <button
                    onClick={() => handleApply('movie_forwarder')}
                    disabled={applying !== null}
                    className="flex items-center justify-center gap-2 p-3 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 text-xs font-semibold transition-all disabled:opacity-50"
                  >
                    {applying === 'movie_forwarder' ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Key className="w-4 h-4 text-purple-400" />
                    )}
                    Apply to Movie Forwarder (SESSION1)
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-between items-center">
                <button
                  onClick={() => {
                    setStep(1);
                    setPhoneNumber('');
                    setPhoneCode('');
                    setSessionString('');
                  }}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Generate another session &rarr;
                </button>

                <button
                  onClick={handleCopy}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white transition-all shadow-lg"
                >
                  {copied ? 'Copied!' : 'Copy & Finish'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

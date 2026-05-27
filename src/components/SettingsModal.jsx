import React from 'react';
import { X, Settings, Database, Key, ShieldCheck } from 'lucide-react';

const SettingsModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const isGeminiConfigured = !!import.meta.env.VITE_GEMINI_API_KEY;
    const isSupabaseConfigured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

    return (
        <div className="fixed inset-0 z-[300] overflow-y-auto flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="modal-card w-full max-w-lg max-h-[90vh] sm:max-h-none overflow-y-auto animate-in zoom-in-95 duration-200">
                {/* Close */}
                <button onClick={onClose} className="modal-close-btn" title="Close">
                    <X size={18} />
                </button>

                <div className="modal-body">
                    {/* Header */}
                    <div className="flex flex-col items-center text-center mb-8">
                        <div className="modal-icon-badge mb-6">
                            <Settings size={32} className="text-cyan-500 dark:text-cyan-400" />
                        </div>
                        <h2 className="modal-title">System Settings</h2>
                        <p className="modal-subtitle mt-3">
                            API integration and database connection status
                        </p>
                    </div>

                    {/* Status List */}
                    <div className="space-y-4 mb-8">
                        {/* Gemini status */}
                        <div className="p-5 bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/5 rounded-2xl flex items-center justify-between">
                            <div className="flex items-center gap-3.5">
                                <div className="p-3 bg-cyan-500/10 rounded-xl text-cyan-500 dark:text-cyan-400">
                                    <Key size={20} />
                                </div>
                                <div className="text-left">
                                    <div className="text-sm font-black uppercase tracking-wider text-zinc-800 dark:text-white">Google Gemini API</div>
                                    <div className="text-[10px] text-zinc-500 dark:text-gray-550 font-mono mt-1">VITE_GEMINI_API_KEY</div>
                                </div>
                            </div>
                            <div>
                                {isGeminiConfigured ? (
                                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full text-[10px] font-black uppercase tracking-wider font-mono shadow-sm">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-gray-400 rounded-full text-[10px] font-black uppercase tracking-wider font-mono">
                                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" /> Unconfigured
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Supabase status */}
                        <div className="p-5 bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/5 rounded-2xl flex items-center justify-between">
                            <div className="flex items-center gap-3.5">
                                <div className="p-3 bg-cyan-500/10 rounded-xl text-cyan-500 dark:text-cyan-400">
                                    <Database size={20} />
                                </div>
                                <div className="text-left">
                                    <div className="text-sm font-black uppercase tracking-wider text-zinc-800 dark:text-white">Supabase Connection</div>
                                    <div className="text-[10px] text-zinc-500 dark:text-gray-550 font-mono mt-1">VITE_SUPABASE_URL</div>
                                </div>
                            </div>
                            <div>
                                {isSupabaseConfigured ? (
                                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full text-[10px] font-black uppercase tracking-wider font-mono shadow-sm">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-gray-400 rounded-full text-[10px] font-black uppercase tracking-wider font-mono">
                                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" /> Unconfigured
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Notice info */}
                    <div className="flex gap-3.5 items-start p-6 bg-zinc-50 dark:bg-[#090a0d] border border-zinc-205 dark:border-white/5 rounded-2xl mb-8 text-left">
                        <ShieldCheck size={22} className="text-cyan-500 dark:text-cyan-400 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="text-xs font-black uppercase tracking-wider text-zinc-800 dark:text-white mb-1">Secure Environment Configuration</h4>
                            <p className="text-[11px] text-zinc-500 dark:text-gray-450 leading-relaxed">
                                Credentials are loaded securely via system environment variables. To update them, modify your deployment configuration settings (e.g. Vercel Console) or your local <code className="text-cyan-600 dark:text-cyan-400 font-bold font-mono">.env</code> file.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="modal-btn-primary w-full py-4 rounded-xl text-xs uppercase tracking-[0.2em] font-black"
                    >
                        Close Settings
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;

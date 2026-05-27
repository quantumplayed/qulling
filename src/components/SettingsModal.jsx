import React, { useState, useEffect } from 'react';
import { X, Settings, Database, Key, Check, ShieldAlert } from 'lucide-react';

const SettingsModal = ({ isOpen, onClose, onSave }) => {
    const [supabaseUrl, setSupabaseUrl] = useState('');
    const [supabaseKey, setSupabaseKey] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
    const [savedStatus, setSavedStatus] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setSupabaseUrl(localStorage.getItem('qulling_supabase_url') || '');
            setSupabaseKey(localStorage.getItem('qulling_supabase_anon_key') || '');
            setGeminiKey(localStorage.getItem('qulling_gemini_api_key') || '');
            setSavedStatus(false);
        }
    }, [isOpen]);

    const handleSave = (e) => {
        e.preventDefault();
        localStorage.setItem('qulling_supabase_url', supabaseUrl.trim());
        localStorage.setItem('qulling_supabase_anon_key', supabaseKey.trim());
        localStorage.setItem('qulling_gemini_api_key', geminiKey.trim());
        setSavedStatus(true);
        setTimeout(() => {
            setSavedStatus(false);
            if (onSave) onSave();
            onClose();
        }, 1200);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
            <div className="modal-card w-full max-w-lg">
                {/* Close */}
                <button onClick={onClose} className="modal-close-btn" title="Close">
                    <X size={18} />
                </button>

                <div className="modal-body">
                    {/* Header */}
                    <div className="flex flex-col items-center text-center mb-10">
                        <div className="modal-icon-badge mb-6">
                            <Settings size={32} className="text-cyan-500 dark:text-cyan-400" />
                        </div>
                        <h2 className="modal-title">Settings</h2>
                        <p className="modal-subtitle mt-3">
                            Configure your API credentials to activate the analysis engine
                        </p>
                    </div>

                    {/* Warning */}
                    <div className="flex gap-3 items-start p-5 bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-2xl mb-8">
                        <ShieldAlert size={20} className="text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">
                            Credentials are stored in your browser's local storage. Only use on a trusted device.
                        </p>
                    </div>

                    <form onSubmit={handleSave} className="space-y-6">
                        <div className="modal-field">
                            <label className="modal-label">
                                <Key size={15} className="text-cyan-500 dark:text-cyan-400" />
                                Google Gemini API Key
                            </label>
                            <input
                                type="password"
                                value={geminiKey}
                                onChange={(e) => setGeminiKey(e.target.value)}
                                placeholder="AIzaSy..."
                                className="modal-input font-mono"
                            />
                        </div>

                        <div className="modal-field">
                            <label className="modal-label">
                                <Database size={15} className="text-cyan-500 dark:text-cyan-400" />
                                Supabase Project URL
                            </label>
                            <input
                                type="text"
                                value={supabaseUrl}
                                onChange={(e) => setSupabaseUrl(e.target.value)}
                                placeholder="https://your-project.supabase.co"
                                className="modal-input font-mono"
                            />
                        </div>

                        <div className="modal-field">
                            <label className="modal-label">
                                <Database size={15} className="text-cyan-500 dark:text-cyan-400" />
                                Supabase Anon Key
                            </label>
                            <input
                                type="password"
                                value={supabaseKey}
                                onChange={(e) => setSupabaseKey(e.target.value)}
                                placeholder="eyJhbGci..."
                                className="modal-input font-mono"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={savedStatus}
                            className="modal-btn-primary w-full mt-2"
                        >
                            {savedStatus ? (
                                <>
                                    <Check size={18} /> Saved successfully
                                </>
                            ) : (
                                'Save Settings'
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;

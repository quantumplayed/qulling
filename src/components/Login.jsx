import React, { useState } from 'react';
import { ShieldCheck, Loader, Key, User, ArrowRight } from 'lucide-react';
import { getSupabaseClient } from '../services/supabaseClient';

const Login = ({ onLoginSuccess, onCancel }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase is not configured! Please click the Settings gear icon first.');
      setLoading(false);
      return;
    }

    try {
      // Query profiles table in Supabase for matching credentials
      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username.trim())
        .eq('password', password.trim())
        .maybeSingle();

      if (queryError) {
        throw new Error(queryError.message);
      }

      if (data) {
        onLoginSuccess({
          username: data.username,
          role: data.role,
          name: data.name,
          affiliation: data.affiliation || 'Expert Partner'
        });
      } else {
        setError('Invalid username or secret token');
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Database connection handshake failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 font-sans relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.08)_0%,transparent_65%)] pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-[300px] h-[300px] bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-purple-500/5 blur-[100px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md glass-panel p-8 sm:p-10 border-white/10 relative z-10 bg-zinc-950/80 backdrop-blur-xl rounded-3xl shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl mb-4 text-emerald-400 animate-pulse">
            <ShieldCheck size={32} />
          </div>
          <h2 className="text-2xl font-black uppercase tracking-widest text-white text-center">
            Qulling Security Gate
          </h2>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mt-1">
            Supabase Node Authorization
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider ml-1">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
                <User size={16} />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                className="w-full bg-black/60 border border-white/10 rounded-xl pl-10 pr-4 py-3.5 text-sm text-white placeholder-gray-600 outline-none focus:border-emerald-500 focus:shadow-[0_0_15px_rgba(16,185,129,0.1)] transition-all font-mono"
                placeholder="e.g. prof_alice"
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider ml-1">
              Secret Token (Password)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
                <Key size={16} />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full bg-black/60 border border-white/10 rounded-xl pl-10 pr-4 py-3.5 text-sm text-white placeholder-gray-600 outline-none focus:border-emerald-500 focus:shadow-[0_0_15px_rgba(16,185,129,0.1)] transition-all font-mono"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="supabase-btn-green w-full py-4 text-[11px] uppercase tracking-[0.2em] rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group cursor-pointer"
            >
              {loading ? (
                <Loader className="animate-spin" size={16} />
              ) : (
                <>
                  Authorize & Sign In
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="w-full py-3.5 text-gray-500 hover:text-gray-300 text-[10px] font-mono uppercase tracking-[0.2em] transition-all"
            >
              Abort Handshake
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono rounded-xl text-center animate-in fade-in zoom-in duration-300">
            ⚠ ERROR: {error.toUpperCase()}
          </div>
        )}

        {/* Helpful instructions for demo */}
        <div className="mt-8 pt-6 border-t border-white/5 text-[9px] font-mono text-gray-600 text-center leading-relaxed space-y-1">
          <div>DEMO CREDENTIALS:</div>
          <div>Customer (User): <span className="text-emerald-500/60">user_charlie</span> / <span className="text-emerald-500/60">password123</span></div>
          <div>Reviewer: <span className="text-purple-500/60">prof_alice</span> / <span className="text-purple-500/60">password123</span></div>
          <div>Admin: <span className="text-cyan-500/60">admin</span> / <span className="text-cyan-500/60">password123</span></div>
        </div>
      </div>
    </div>
  );
};

export default Login;

import React, { useState, useEffect, useRef } from 'react';
import { X, Mail, Lock, ShieldCheck, Loader, ArrowRight } from 'lucide-react';
import { getSupabaseClient, getSupabaseConfig } from '../services/supabaseClient';

const AuthModal = ({ isOpen, onClose, onAuthSuccess }) => {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]);
  
  const modalRef = useRef(null);
  const logsRef = useRef([]);

  const addDebugLog = (msg) => {
    const timeMsg = `${new Date().toLocaleTimeString()}: ${msg}`;
    console.log(`[AUTH_DEBUG] ${msg}`);
    logsRef.current = [...logsRef.current, timeMsg];
    setDebugLogs(logsRef.current);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleRejection = (event) => {
      console.warn('Unhandled promise rejection:', event.reason);
      const reasonStr = event.reason?.message || String(event.reason || 'Unknown rejection reason');
      addDebugLog(`UNHANDLED PROMISE REJECTION: ${reasonStr}`);
    };

    const handleError = (event) => {
      console.warn('Global error caught:', event.error);
      const errorStr = event.message || String(event.error || 'Unknown runtime error');
      addDebugLog(`GLOBAL RUNTIME ERROR: ${errorStr}`);
    };

    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('error', handleError);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('error', handleError);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleBackdropClick = (e) => {
    if (modalRef.current && !modalRef.current.contains(e.target)) onClose();
  };

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setEmail('');
    setPassword('');
  };

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    logsRef.current = [];
    setDebugLogs([]);

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password');
      return;
    }

    setLoading(true);
    setError('');
    addDebugLog('Auth workflow initiated.');

    const { url, key } = getSupabaseConfig();
    if (!url || !key) {
      addDebugLog('Missing Supabase URL or Anon Key. Please configure them in Settings.');
      throw new Error('Supabase configuration missing.');
    }
    
    addDebugLog(`Config URL: "${url}"`);
    addDebugLog(`Config Key: ${key.length} chars (starts with ${key.substring(0, 8)})`);
    
    if (!key.startsWith('eyJ') && !key.startsWith('sb_publishable_')) {
      const errorMsg = `Invalid Anon Key format. Supabase keys must be a JWT (eyJ) or 'sb_publishable_'. Your key starts with '${key.substring(0, 8)}'. Please check Project Settings -> API.`;
      addDebugLog(`Error: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase is not configured. Click the Settings gear icon first.');
      addDebugLog('Error: Supabase client initialization failed.');
      setLoading(false);
      return;
    }

    try {
      // Direct raw fetch connection check to identify network block / DNS issues
      addDebugLog('Testing direct connectivity to Supabase endpoint...');
      const cleanUrl = url.replace(/\/$/, '');
      const pingUrl = `${cleanUrl}/auth/v1/settings?apikey=${key}`;
      
      try {
        const pingPromise = fetch(pingUrl, { method: 'GET', headers: { 'apikey': key } });
        const pingTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Direct connection request timed out (5s).')), 5000)
        );
        const pingResponse = await Promise.race([pingPromise, pingTimeout]);
        addDebugLog(`Direct API reply: HTTP ${pingResponse.status} ${pingResponse.statusText}`);
      } catch (pingErr) {
        addDebugLog(`Direct API reply failed: ${pingErr.message}`);
      }

      if (mode === 'signin') {
        addDebugLog(`Attempting auth.signInWithPassword for: ${email.trim()}...`);
        const signInPromise = supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Sign in request timed out. Please check your Supabase URL/Key in Settings and network connection.')), 10000)
        );

        addDebugLog('Awaiting response from Supabase Auth client (max 10s)...');
        const { data, error: signInError } = await Promise.race([signInPromise, timeoutPromise]);

        if (signInError) {
          addDebugLog(`Auth server returned error: ${signInError.message}`);
          throw signInError;
        }

        if (data?.user) {
          addDebugLog(`Auth successful! User ID: ${data.user.id}. Querying profiles table...`);
          const profilePromise = supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .maybeSingle();

          const { data: profile, error: profileError } = await Promise.race([
            profilePromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Profile retrieval timed out. Please verify database connection.')), 8000))
          ]);

          if (profileError) {
            addDebugLog(`Database profiles query failed: ${profileError.message}`);
            throw profileError;
          }
          
          if (!profile) {
            addDebugLog('Error: Profile row missing from public.profiles table!');
            throw new Error('User profile not found. Please contact support.');
          }

          addDebugLog(`Profile loaded! Role: ${profile.role}, Name: ${profile.name || 'N/A'}. Triggering app success view...`);
          onAuthSuccess({
            id: profile.id,
            email: profile.email,
            role: profile.role,
            name: profile.name,
            affiliation: profile.affiliation || '',
          });
          onClose();
        } else {
          addDebugLog('Warning: Sign in resolved but data.user is empty.');
        }
      } else {
        addDebugLog(`Attempting auth.signUp for: ${email.trim()}...`);
        const signUpPromise = supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
        });

        addDebugLog('Awaiting response from Supabase signup servers (max 10s)...');
        const { data, error: signUpError } = await Promise.race([
          signUpPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Sign up request timed out. Please check configuration.')), 10000))
        ]);

        if (signUpError) {
          const isUserExists = signUpError.message?.toLowerCase().includes('already registered') || 
                               signUpError.message?.toLowerCase().includes('already exists') || 
                               signUpError.status === 400 ||
                               signUpError.code === 'user_already_exists';

          if (isUserExists) {
            addDebugLog("User already registered. Performing automatic login fallback...");
            const signInPromise = supabase.auth.signInWithPassword({
              email: email.trim(),
              password: password.trim(),
            });

            const { data: signInData, error: signInError } = await Promise.race([
              signInPromise,
              new Promise((_, reject) => setTimeout(() => reject(new Error('Auto-login fallback timed out.')), 10000))
            ]);

            if (signInError) {
              addDebugLog(`Auto-login fallback failed: ${signInError.message}`);
              throw signInError;
            }

            if (signInData?.user) {
              addDebugLog("Auto-login successful! Fetching profile...");
              const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', signInData.user.id)
                .maybeSingle();

              if (profileError) throw profileError;

              if (!profile) {
                // Create profile if missing
                const derivedName = email.trim().split('@')[0];
                const { error: insertError } = await supabase
                  .from('profiles')
                  .insert({
                    id: signInData.user.id,
                    email: email.trim(),
                    name: derivedName,
                    role: 'user',
                    affiliation: 'Member',
                  });
                if (insertError) throw insertError;

                onAuthSuccess({
                  id: signInData.user.id,
                  email: email.trim(),
                  role: 'user',
                  name: derivedName,
                  affiliation: 'Member',
                });
              } else {
                onAuthSuccess({
                  id: profile.id,
                  email: profile.email,
                  role: profile.role,
                  name: profile.name,
                  affiliation: profile.affiliation || '',
                });
              }
              onClose();
              return;
            }
          }
          
          addDebugLog(`Signup request failed: ${signUpError.message}`);
          throw signUpError;
        }

        if (data?.user) {
          addDebugLog(`Signup successful! User ID: ${data.user.id}. Creating profile record...`);
          const derivedName = email.trim().split('@')[0];
          const profileInsertPromise = supabase
            .from('profiles')
            .insert({
              id: data.user.id,
              email: email.trim(),
              name: derivedName,
              role: 'user',
              affiliation: 'Member',
            });

          const { error: profileError } = await Promise.race([
            profileInsertPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Profile creation timed out.')), 8000))
          ]);

          if (profileError) {
            addDebugLog(`Profile creation failed: ${profileError.message}`);
            throw profileError;
          }

          addDebugLog('Profile created successfully.');
          if (data.session) {
            addDebugLog('Session found, logging in user...');
            onAuthSuccess({
              id: data.user.id,
              email: email.trim(),
              role: 'user',
              name: derivedName,
              affiliation: 'Member',
            });
            onClose();
          } else {
            addDebugLog('Signup complete. Confirmation email may be required.');
            setSignupSuccess(true);
          }
        }
      }
    } catch (err) {
      addDebugLog(`Fatal exception caught: ${err.message}`);
      console.error('[AUTH_DEBUG_ERROR]', err);
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      addDebugLog('Auth workflow complete.');
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[500] overflow-y-auto flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="modal-card w-full max-w-lg max-h-[90vh] sm:max-h-none overflow-y-auto"
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="modal-close-btn"
          title="Close"
        >
          <X size={18} />
        </button>

        {signupSuccess ? (
          <div className="text-center py-8 px-6">
            <div className="inline-flex p-5 bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 rounded-2xl text-emerald-600 dark:text-emerald-400 mb-6">
              <ShieldCheck size={40} />
            </div>
            <h3 className="text-2xl font-bold text-zinc-900 dark:text-white mb-3">Check your inbox</h3>
            <p className="text-base text-zinc-500 dark:text-gray-400 leading-relaxed max-w-sm mx-auto">
              If email confirmation is enabled on your Supabase project, activate your account via the link we sent. Otherwise you can sign in right away.
            </p>
            <button
              onClick={() => { setSignupSuccess(false); switchMode('signin'); }}
              className="mt-8 modal-btn-primary px-8"
            >
              Go to Sign In
            </button>
          </div>
        ) : (
          <div className="modal-body">
            {/* Header */}
            <div className="flex flex-col items-center text-center mb-10">
              <div className="modal-icon-badge mb-6">
                <ShieldCheck size={32} className="text-[#3ecf8e]" />
              </div>
              <h2 className="modal-title">
                {mode === 'signin' ? 'Welcome back' : 'Create account'}
              </h2>
              <p className="modal-subtitle mt-3">
                {mode === 'signin'
                  ? 'Sign in to access your Qulling dashboard'
                  : 'Register to get started with Qulling'}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="modal-field">
                <label className="modal-label">Email address</label>
                <div className="relative">
                  <Mail size={18} className="modal-field-icon" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    placeholder="name@domain.com"
                    required
                    className="modal-input modal-input-icon"
                  />
                </div>
              </div>

              <div className="modal-field">
                <label className="modal-label">Password</label>
                <div className="relative">
                  <Lock size={18} className="modal-field-icon" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    placeholder="••••••••••••"
                    required
                    className="modal-input modal-input-icon"
                  />
                </div>
              </div>

              {error && (
                <div className="modal-error">{error}</div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="modal-btn-primary w-full mt-3"
              >
                {loading ? (
                  <Loader className="animate-spin" size={18} />
                ) : (
                  <>
                    {mode === 'signin' ? 'Sign In' : 'Create Account'}
                    <ArrowRight size={17} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>



            {/* Toggle link */}
            <div className="mt-8 pt-7 border-t border-zinc-100 dark:border-white/5 text-center">
              {mode === 'signin' ? (
                <p className="text-sm text-zinc-500 dark:text-gray-500">
                  Don't have an account yet?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className="font-semibold text-[#3ecf8e] hover:underline cursor-pointer"
                  >
                    Register one
                  </button>
                </p>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-gray-500">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="font-semibold text-[#3ecf8e] hover:underline cursor-pointer"
                  >
                    Log in
                  </button>
                </p>
              )}
              <p className="text-xs text-zinc-400 dark:text-gray-600 mt-3">
                New accounts start with standard user access. An admin can update your role.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthModal;

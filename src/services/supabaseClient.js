import { createClient } from '@supabase/supabase-js';

// Load Supabase credentials from browser localStorage or Vite environment variables
export const getSupabaseConfig = () => {
    const url = localStorage.getItem('qulling_supabase_url') || import.meta.env.VITE_SUPABASE_URL || '';
    const key = localStorage.getItem('qulling_supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    return { url, key };
};

let supabaseInstance = null;
let lastUrl = '';
let lastKey = '';

// Returns an active Supabase client instance or null if credentials are not configured yet
export const getSupabaseClient = () => {
    const { url, key } = getSupabaseConfig();
    if (!url || !key) return null;
    if (supabaseInstance && url === lastUrl && key === lastKey) {
        return supabaseInstance;
    }
    try {
        lastUrl = url;
        lastKey = key;
        supabaseInstance = createClient(url, key, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                lock: async (name, acquireTimeout, fn) => {
                    // Custom no-op lock to completely bypass navigator.locks deadlocking issues in Dev / React Strict Mode
                    return await fn();
                }
            }
        });
        return supabaseInstance;
    } catch (e) {
        console.error("Failed to initialize Supabase client:", e);
        return null;
    }
};

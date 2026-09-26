import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url || 'http://localhost', anonKey || 'public-anon-key');
export const apiUrl = import.meta.env.VITE_API_URL || '';
export const supabaseConfigured = Boolean(url && anonKey);

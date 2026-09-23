// ============================================
// Campus Connect — Supabase Configuration
// ============================================
// IMPORTANT: Replace these with your actual Supabase credentials
// Find them at: https://supabase.com/dashboard → Project Settings → API

const SUPABASE_URL = 'https://gycjbdykdgsblwjydmdn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5Y2piZHlrZGdzYmx3anlkbWRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MDA3NjMsImV4cCI6MjEwMzM3Njc2M30.U04TV23_EwuVd5TMzD_R6Srj3KPyOY9gO_OZHj5u0x4';

// Initialize Supabase client
window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

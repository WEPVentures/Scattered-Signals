import { createClient } from "@supabase/supabase-js";

// .trim() guards against a stray trailing newline/space from pasting
// values into Netlify's env var UI.
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your Supabase project settings.",
  );
}

export const supabase = createClient(url, anonKey);

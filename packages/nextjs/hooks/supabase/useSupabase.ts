import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseApiKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (supabaseApiKey === undefined || supabaseUrl === undefined) {
  throw new Error("Supabase API key is missing in the environment variables.");
}

const supabase = createClient(supabaseUrl, supabaseApiKey);

export default function useSupabase() {
  return supabase;
}

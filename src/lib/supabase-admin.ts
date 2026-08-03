import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;
let cachedUrl = "";
let cachedKey = "";

export function getSupabaseAdmin(): SupabaseClient {
  const url =
    process.env.SUPABASE_INTERNAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

  if (!url) {
    throw new Error(
      "The Supabase URL is missing. Set SUPABASE_INTERNAL_URL or NEXT_PUBLIC_SUPABASE_URL."
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for the integrated Spin Wheel admin."
    );
  }

  if (
    cachedClient &&
    cachedUrl === url &&
    cachedKey === serviceRoleKey
  ) {
    return cachedClient;
  }

  cachedUrl = url;
  cachedKey = serviceRoleKey;
  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
}

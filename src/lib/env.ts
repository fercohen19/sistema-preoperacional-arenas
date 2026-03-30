export function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function isPlaceholderValue(value: string | undefined) {
  if (!value) {
    return true;
  }

  return value.includes("TU-");
}

export function isSupabaseConfigured() {
  return (
    !isPlaceholderValue(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !isPlaceholderValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

// Supabase/PostgREST errors are plain objects ({ message, details, hint,
// code }), not `instanceof Error` — a naive String(e) fallback on those
// prints "[object Object]" instead of anything useful.
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const obj = e as Record<string, unknown>;
    const parts = [obj.message, obj.details, obj.hint].filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    if (parts.length > 0) return parts.join(" — ");
    try {
      return JSON.stringify(obj);
    } catch {
      // fall through
    }
  }
  return String(e);
}

import { supabase } from "./supabaseClient";

/**
 * Deletes a signal via the delete-signal Function rather than a direct
 * Supabase client call — deletion of a published signal needs to also
 * trigger the public site's build hook, and that has to happen
 * server-side (same reason publish goes through a Function instead of a
 * plain client upsert).
 */
export async function deleteSignal(signalId: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const res = await fetch("/.netlify/functions/delete-signal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionData.session?.access_token ?? ""}`,
    },
    body: JSON.stringify({ signalId }),
  });
  if (!res.ok) throw new Error(`Delete failed: ${await res.text()}`);
  return res.json() as Promise<{ deleted: boolean; rebuildTriggered: boolean }>;
}

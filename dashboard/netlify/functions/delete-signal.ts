import { createClient } from "@supabase/supabase-js";

// Server-side only, mirroring publish-signal.ts: verifies the caller's
// Supabase session, deletes the signal (evidence/signal_updates/
// confidence_snapshots cascade via the FK), and — only if the signal was
// actually published — triggers the public site's build hook so the live
// page and index listing are regenerated without it. A draft that was
// never published never made it into the static site, so deleting one
// doesn't need a rebuild.

export default async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response("Missing Authorization header", { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const buildHookUrl = process.env.PUBLIC_SITE_BUILD_HOOK_URL?.trim();

  if (!supabaseUrl || !serviceRoleKey || !buildHookUrl) {
    return new Response("Server misconfigured: missing Supabase or build hook env vars", {
      status: 500,
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    return new Response(`Invalid session: ${userError?.message ?? "no user returned"}`, {
      status: 401,
    });
  }

  let signalId: string;
  try {
    const body = await req.json();
    signalId = body.signalId;
    if (!signalId) throw new Error("missing signalId");
  } catch {
    return new Response("Expected JSON body with signalId", { status: 400 });
  }

  const { data: signal, error: signalError } = await admin
    .from("signals")
    .select("id, status")
    .eq("id", signalId)
    .single();

  if (signalError || !signal) {
    return new Response("Topic not found", { status: 404 });
  }

  const wasPublished = signal.status === "published";

  const { error: deleteError } = await admin.from("signals").delete().eq("id", signalId);
  if (deleteError) {
    return new Response(`Delete failed: ${deleteError.message}`, { status: 500 });
  }

  if (wasPublished) {
    const hookRes = await fetch(buildHookUrl, { method: "POST" });
    if (!hookRes.ok) {
      return new Response(
        JSON.stringify({ deleted: true, rebuildTriggered: false, rebuildError: hookRes.status }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  return new Response(JSON.stringify({ deleted: true, rebuildTriggered: wasPublished }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

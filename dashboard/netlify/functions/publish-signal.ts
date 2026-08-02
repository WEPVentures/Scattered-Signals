import { createClient } from "@supabase/supabase-js";

// Server-side only: verifies the caller's Supabase session, confirms the
// signal is actually marked published, then triggers the public site's
// Netlify build hook. The build hook URL and service role key never reach
// the browser bundle — that's the entire reason this is a Function and not
// a direct client-side Supabase call.

export default async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response("Missing Authorization header", { status: 401 });
  }

  // .trim() guards against a stray trailing newline/space from pasting
  // values into Netlify's env var UI — easy to introduce on mobile, and it
  // silently turns a correct key/URL into an invalid one.
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
  if (signal.status !== "published") {
    return new Response("Topic is not marked published — nothing to build", { status: 409 });
  }

  const hookRes = await fetch(buildHookUrl, { method: "POST" });
  if (!hookRes.ok) {
    return new Response(`Build hook failed: ${hookRes.status}`, { status: 502 });
  }

  return new Response(JSON.stringify({ triggered: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

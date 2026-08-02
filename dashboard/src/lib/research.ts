import { supabase } from "./supabaseClient";
import { createResearchTopic, type ResearchTopicRow } from "./db";

// A topic should flip from "queued" to "researching" within seconds of the
// triggering fetch landing — if it's still "queued" well past that, the
// request almost certainly never reached the background function (no
// retry exists, so nothing will ever change it). "researching" gets a much
// longer grace period since a real run can take several minutes, capped at
// Netlify Background Functions' own 15-minute hard limit — past that the
// function was killed without ever writing a final status.
const STALE_QUEUED_MS = 2 * 60 * 1000;
const STALE_RESEARCHING_MS = 16 * 60 * 1000;

export function isResearchTopicStale(topic: ResearchTopicRow): boolean {
  const elapsedMs = Date.now() - new Date(topic.submitted_at).getTime();
  if (topic.status === "queued") return elapsedMs > STALE_QUEUED_MS;
  if (topic.status === "researching") return elapsedMs > STALE_RESEARCHING_MS;
  return false;
}

/**
 * Starts a brand-new research run. Creates the research_topics row directly
 * (permitted under the "authenticated full access" RLS policy) so we have a
 * topicId to poll before invoking the Background Function — Netlify returns
 * an immediate 202 with no body for a "-background" function, so there's no
 * other way to learn the id it's working on.
 */
export async function startResearch(params: {
  topicText: string;
  notes?: string | null;
  categoryHint?: string | null;
  typeHint?: "trend" | "claim" | null;
}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const topic = await createResearchTopic({
    topic_text: params.topicText,
    notes: params.notes ?? null,
    category_hint: params.categoryHint ?? null,
    type_hint: params.typeHint ?? null,
    submitted_by: sessionData.session?.user.email ?? null,
  });

  await invokeBackgroundFunction("research-topic-background", sessionData.session?.access_token, {
    topicId: topic.id,
  });

  return topic;
}

/**
 * Starts a refresh run against an already-published signal. Same
 * topicId-first pattern as startResearch — the client owns the
 * research_topics insert, the Background Function only updates it.
 */
export async function startRefresh(params: { signalId: string; signalTitle: string }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const topic = await createResearchTopic({
    topic_text: `Refresh: ${params.signalTitle}`,
    submitted_by: sessionData.session?.user.email ?? null,
  });

  await invokeBackgroundFunction("refresh-topic-background", sessionData.session?.access_token, {
    topicId: topic.id,
    signalId: params.signalId,
  });

  return topic;
}

/**
 * Background Functions always respond 202 with an empty body — that's how
 * Netlify signals "accepted, running async." Anything else (a plain 200,
 * in particular) means the request never reached the function at all: most
 * likely Netlify's SPA catch-all redirect served back index.html instead.
 * fetch() doesn't reject on that, so without this check the failure is
 * invisible — the topic just sits at "queued" forever with no error.
 */
async function invokeBackgroundFunction(
  functionName: string,
  accessToken: string | undefined,
  body: Record<string, string>,
): Promise<void> {
  const res = await fetch(`/.netlify/functions/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken ?? ""}`,
    },
    body: JSON.stringify(body),
  });
  if (res.status !== 202) {
    throw new Error(
      `Expected a 202 Accepted from ${functionName}, got ${res.status}. This usually means the request never reached the function (e.g. an intercepting redirect) rather than the function itself failing.`,
    );
  }
}

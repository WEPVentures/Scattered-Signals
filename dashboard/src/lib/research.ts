import { supabase } from "./supabaseClient";
import { createResearchTopic } from "./db";

/**
 * Starts a brand-new research run. Creates the research_topics row directly
 * (permitted under the "authenticated full access" RLS policy) so we have a
 * topicId to poll before invoking the Background Function — Netlify returns
 * an immediate 202 with no body for -background.ts functions, so there's no
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

  await fetch("/.netlify/functions/research-topic-background", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionData.session?.access_token ?? ""}`,
    },
    body: JSON.stringify({ topicId: topic.id }),
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

  await fetch("/.netlify/functions/refresh-topic-background", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionData.session?.access_token ?? ""}`,
    },
    body: JSON.stringify({ topicId: topic.id, signalId: params.signalId }),
  });

  return topic;
}

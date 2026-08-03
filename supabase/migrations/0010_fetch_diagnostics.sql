-- Ground truth for why the fact-checker's web_fetch calls failed, instead of
-- only having the model's own (potentially invented) narrative of why. Each
-- entry is { url, ok, errorCode } read directly off the real
-- web_fetch_tool_result blocks — never written or paraphrased by the model.
alter table research_runs
  add column fetch_diagnostics jsonb;

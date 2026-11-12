import { retryPolicies, setDefaultOpenAIClient, type ModelSettings } from "@openai/agents";
import OpenAI from "openai";

// What happens when a call to the model fails. Without this, a request is retried by the OpenAI
// library with its own defaults and waits up to ten minutes before giving up.
//
// A failed call is retried only for problems that are likely to pass: a dropped connection,
// a rate limit, a busy server. A bad request or a bad key fails straight away. Waits between
// attempts grow (1s, 2s, 4s, ...) with some randomness, so many clients do not retry in step,
// and a "retry after" hint from the server is honoured. A reply that has already started
// streaming is never retried, because the user may have seen part of it.
const RETRYABLE_STATUSES = [408, 409, 429, 500, 502, 503, 504];

export const MAX_RETRIES = 3;

// The OpenAI client also retries on its own (twice by default). Left on, those retries would
// stack on top of the ones below, so the first attempt would be repeated three times before the
// policy even starts. Turning them off leaves one place that decides. The key is read here once
// the environment is loaded; a missing key is reported by the chat route, not by the server
// failing to start.
setDefaultOpenAIClient(new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "not-set", maxRetries: 0 }));

function retrySettings(): NonNullable<ModelSettings["retry"]> {
  return {
    maxRetries: MAX_RETRIES,
    backoff: { initialDelayMs: 1000, maxDelayMs: 15_000, multiplier: 2, jitter: true },
    policy: retryPolicies.any(
      retryPolicies.retryAfter(),
      retryPolicies.networkError(),
      retryPolicies.httpStatus(RETRYABLE_STATUSES),
    ),
  };
}

// The chat reply may run a web search and several memory lookups, so one call gets longer than
// the background work, which only reads and writes short text.
const REPLY_TIMEOUT_MS = 180_000;
const BACKGROUND_TIMEOUT_MS = 90_000;

// Replies are asked to be concise at the model level; the prompt's length guidance alone was not
// enough after a web search, where the model tended to report everything it found.
export const replyModelSettings = (): ModelSettings => ({
  timeoutMs: REPLY_TIMEOUT_MS,
  retry: retrySettings(),
  text: { verbosity: "low" },
});
export const backgroundModelSettings = (): ModelSettings => ({
  timeoutMs: BACKGROUND_TIMEOUT_MS,
  retry: retrySettings(),
});

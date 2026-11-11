// Runs background jobs one at a time, in the order they were added. Memory updates (profile
// facts, summaries) read and then rewrite shared rows, so running them in parallel could lose
// updates. A failed job is logged and does not stop the ones behind it.
let tail: Promise<unknown> = Promise.resolve();

// A job that has not finished by then is given up on, so one stuck call cannot hold up every job
// behind it. Each model call has its own, shorter timeout; this is the backstop for the whole job.
export const JOB_DEADLINE_MS = 5 * 60_000;

function withDeadline(job: () => Promise<void>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`took longer than ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([job(), expired]).finally(() => clearTimeout(timer));
}

export function enqueue(name: string, job: () => Promise<void>, deadlineMs = JOB_DEADLINE_MS): void {
  tail = tail.then(() => withDeadline(job, deadlineMs)).catch((err) => {
    console.error(`background job "${name}" failed:`, err instanceof Error ? err.message : err);
  });
}

// Resolves once every job added so far has finished. Used by tests and clean shutdown.
export function idle(): Promise<void> {
  return tail.then(() => undefined);
}

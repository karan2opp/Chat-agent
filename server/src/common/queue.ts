// Runs background jobs one at a time, in the order they were added. Memory updates (profile
// facts, summaries) read and then rewrite shared rows, so running them in parallel could lose
// updates. A failed job is logged and does not stop the ones behind it.
let tail: Promise<unknown> = Promise.resolve();

export function enqueue(name: string, job: () => Promise<void>): void {
  tail = tail.then(job).catch((err) => {
    console.error(`background job "${name}" failed:`, err instanceof Error ? err.message : err);
  });
}

// Resolves once every job added so far has finished. Used by tests and clean shutdown.
export function idle(): Promise<void> {
  return tail.then(() => undefined);
}

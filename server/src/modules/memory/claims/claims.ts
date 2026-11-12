import type { Claim } from "./claim.table.js";

// Grouping claims into a timeline per (subject, attribute) and flagging where the value changed.
// This is plain code on purpose: whether a price changed should not depend on a model's mood.

export type ClaimEntry = {
  claimId: number;
  turnId: number;
  value: string;
  amount: number | null;
  sourceUrl: string | null;
  asOf: Date;
  // True when this entry's value differs from the one before it on the same timeline.
  changedFromPrevious: boolean;
};

export type ClaimTimeline = {
  topic: string;
  subject: string;
  attribute: string;
  entries: ClaimEntry[];
};

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// Numbers are compared as numbers when both sides have one, otherwise the wording is compared.
export function sameValue(a: Pick<Claim, "value" | "amount">, b: Pick<Claim, "value" | "amount">): boolean {
  if (a.amount !== null && b.amount !== null) return a.amount === b.amount;
  return normalise(a.value) === normalise(b.value);
}

export function buildTimelines(rows: Claim[]): ClaimTimeline[] {
  const groups = new Map<string, Claim[]>();
  for (const row of rows) {
    const key = `${normalise(row.subject)}|${normalise(row.attribute)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.values()].map((group) => {
    const sorted = [...group].sort((a, b) => a.asOf.getTime() - b.asOf.getTime() || a.id - b.id);
    return {
      topic: sorted[0].topic,
      subject: sorted[0].subject,
      attribute: sorted[0].attribute,
      entries: sorted.map((c, i) => ({
        claimId: c.id,
        turnId: c.turnId,
        value: c.value,
        amount: c.amount,
        sourceUrl: c.sourceUrl,
        asOf: c.asOf,
        changedFromPrevious: i > 0 && !sameValue(sorted[i - 1], c),
      })),
    };
  });
}

import type { TurnSource } from "./chat.table.js";

// Pulls the web pages a reply cited out of a finished agent run. The hosted web search tool puts
// them on the reply text as `url_citation` annotations. The run's items are searched generically
// because where exactly they sit differs between SDK versions and models.
export function collectSources(items: ReadonlyArray<{ rawItem?: unknown }>): TurnSource[] {
  const found = new Map<string, string>();
  const seen = new WeakSet<object>();

  const visit = (value: unknown, depth: number) => {
    if (depth > 8 || typeof value !== "object" || value === null || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const v of value) visit(v, depth + 1);
      return;
    }
    const obj = value as Record<string, unknown>;
    if (obj.type === "url_citation") {
      // Responses API puts url/title on the annotation; Chat Completions nests them one level down.
      const cite = typeof obj.url === "string" ? obj : (obj.url_citation as Record<string, unknown> | undefined);
      if (cite && typeof cite.url === "string") {
        const url = cleanUrl(cite.url);
        if (!found.has(url)) found.set(url, typeof cite.title === "string" ? cite.title : "");
      }
    }
    for (const v of Object.values(obj)) visit(v, depth + 1);
  };

  for (const item of items) visit(item.rawItem, 0);
  return [...found].map(([url, title]) => ({ url, title }));
}

// The search tool appends tracking parameters to links; they are not part of the page address.
function cleanUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.searchParams.delete("utm_source");
    return url.toString();
  } catch {
    return raw;
  }
}

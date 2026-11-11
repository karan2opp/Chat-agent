import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectSources } from "./chat.sources.js";

const reply = (annotations: unknown[]) => ({
  rawItem: { type: "message", content: [{ type: "output_text", text: "...", providerData: { annotations } }] },
});

describe("collectSources", () => {
  it("collects url citations and strips the tracking parameter", () => {
    const items = [
      reply([
        { type: "url_citation", url: "https://example.com/pricing?utm_source=openai", title: "Pricing" },
        { type: "url_citation", url: "https://example.org/a?plan=pro&utm_source=openai", title: "Plans" },
      ]),
    ];
    assert.deepEqual(collectSources(items), [
      { url: "https://example.com/pricing", title: "Pricing" },
      { url: "https://example.org/a?plan=pro", title: "Plans" },
    ]);
  });

  it("lists a page once even if it is cited several times", () => {
    const cite = { type: "url_citation", url: "https://example.com/", title: "Home" };
    assert.equal(collectSources([reply([cite, cite]), reply([cite])]).length, 1);
  });

  it("reads the nested Chat Completions shape", () => {
    const items = [reply([{ type: "url_citation", url_citation: { url: "https://example.com/x", title: "X" } }])];
    assert.deepEqual(collectSources(items), [{ url: "https://example.com/x", title: "X" }]);
  });

  it("returns nothing when there are no citations", () => {
    assert.deepEqual(collectSources([reply([]), { rawItem: undefined }]), []);
  });

  it("survives circular data", () => {
    const loop: Record<string, unknown> = { type: "message" };
    loop.self = loop;
    assert.deepEqual(collectSources([{ rawItem: loop }]), []);
  });
});

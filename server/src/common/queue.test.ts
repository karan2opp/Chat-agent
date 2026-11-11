import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enqueue, idle } from "./queue.js";

describe("queue", () => {
  it("runs jobs one at a time, in order", async () => {
    const order: string[] = [];
    enqueue("slow", async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push("slow");
    });
    enqueue("fast", async () => {
      order.push("fast");
    });
    await idle();
    assert.deepEqual(order, ["slow", "fast"]);
  });

  it("keeps going after a job fails", async () => {
    const original = console.error;
    console.error = () => {};
    let ran = false;
    enqueue("broken", async () => {
      throw new Error("boom");
    });
    enqueue("after", async () => {
      ran = true;
    });
    await idle();
    console.error = original;
    assert.equal(ran, true);
  });

  it("gives up on a job that never finishes so later jobs still run", async () => {
    const original = console.error;
    const logged: unknown[][] = [];
    console.error = (...args: unknown[]) => void logged.push(args);
    let ran = false;
    enqueue("stuck", () => new Promise<void>(() => {}), 30);
    enqueue("after", async () => {
      ran = true;
    });
    await idle();
    console.error = original;
    assert.equal(ran, true);
    assert.match(String(logged[0][0]), /stuck/);
  });
});

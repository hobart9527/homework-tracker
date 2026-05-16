/**
 * Unit tests for concurrency utilities: Pacer and withRetry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Pacer, withRetry } from "@/lib/reading/concurrency";

// --- Pacer -----------------------------------------------------------------

describe("Pacer", () => {
  it("runs tasks immediately when under concurrency limit", async () => {
    const pacer = new Pacer(3);
    const results: number[] = [];

    const r1 = pacer.run(async () => { results.push(1); return 1; });
    const r2 = pacer.run(async () => { results.push(2); return 2; });

    await Promise.all([r1, r2]);

    expect(results).toEqual([1, 2]);
    expect(await r1).toBe(1);
    expect(await r2).toBe(2);
  });

  it("serializes execution so at most `concurrency` tasks run simultaneously", async () => {
    const pacer = new Pacer(3);
    let running = 0;
    let maxRunning = 0;

    const tasks = Array.from({ length: 5 }, (_, i) =>
      pacer.run(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 10));
        running--;
        return i;
      })
    );

    await Promise.all(tasks);

    expect(maxRunning).toBe(3);
  });

  it("returns correct results for each task", async () => {
    const pacer = new Pacer(2);

    const results = await Promise.all([
      pacer.run(async () => "a"),
      pacer.run(async () => "b"),
      pacer.run(async () => "c"),
    ]);

    expect(results).toEqual(["a", "b", "c"]);
  });

  it("propagates errors correctly", async () => {
    const pacer = new Pacer(2);

    await expect(
      pacer.run(async () => {
        throw new Error("task failed");
      })
    ).rejects.toThrow("task failed");
  });

  it("releases slot and continues queue after error", async () => {
    const pacer = new Pacer(1);
    const order: string[] = [];

    const t1 = pacer.run(async () => {
      order.push("t1-start");
      throw new Error("boom");
    }).catch(() => { order.push("t1-catch"); });

    const t2 = pacer.run(async () => {
      order.push("t2");
      return "ok";
    });

    await Promise.all([t1, t2]);

    // t2 starts before t1 catch handler runs because catch is queued on microtask
    expect(order.slice(0, 2)).toEqual(["t1-start", "t2"]);
    expect(order).toContain("t1-catch");
  });
});

// --- withRetry -------------------------------------------------------------

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns result immediately on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = withRetry(fn, { maxRetries: 2, baseDelayMs: 1000 });

    await expect(result).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries once and returns on second attempt success", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce("recovered");

    const resultPromise = withRetry(fn, {
      maxRetries: 2,
      baseDelayMs: 1000,
      shouldRetry: () => true,
    });

    // first attempt fails, schedules retry after 1000ms
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);

    await expect(resultPromise).resolves.toBe("recovered");
  });

  it("throws final error after max retries exhausted", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      throw new Error("persistent");
    });

    const resultPromise = withRetry(fn, {
      maxRetries: 2,
      baseDelayMs: 100,
      shouldRetry: () => true,
    });

    // attach catch handler immediately so the rejection is never unhandled
    const caught = resultPromise.catch((e: unknown) => e);

    // attempt 0 fails -> delay 100ms
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(2);

    // attempt 1 fails -> delay 200ms
    await vi.advanceTimersByTimeAsync(200);
    expect(calls).toBe(3);

    const err = await caught;
    expect((err as Error).message).toBe("persistent");
  });

  it("uses exponential backoff delays capped by maxDelayMs", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      throw new Error("boom");
    });

    const resultPromise = withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 100,
      maxDelayMs: 350,
      shouldRetry: () => true,
    });

    // attach catch handler immediately so the rejection is never unhandled
    const caught = resultPromise.catch((e: unknown) => e);

    // attempt 0 fails immediately
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);

    // attempt 1 after 100ms (100 * 2^0)
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(2);

    // attempt 2 after 200ms (100 * 2^1)
    await vi.advanceTimersByTimeAsync(200);
    expect(calls).toBe(3);

    // attempt 3 after 350ms capped (100 * 2^2 = 400, capped to 350)
    await vi.advanceTimersByTimeAsync(350);
    expect(calls).toBe(4);

    const err = await caught;
    expect((err as Error).message).toBe("boom");
  });

  it("does not retry when shouldRetry returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("no retry"));

    const resultPromise = withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 100,
      shouldRetry: () => false,
    });

    await expect(resultPromise).rejects.toThrow("no retry");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("uses default shouldRetry that retries on 429 and 5xx", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce("ok");

    const resultPromise = withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(20);

    await expect(resultPromise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("default shouldRetry does not retry on 4xx other than 429", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 400 });

    const resultPromise = withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
    });

    await expect(resultPromise).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

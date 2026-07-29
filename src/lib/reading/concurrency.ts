/**
 * Concurrency control utility for LLM API calls.
 * Replaces fixed delay patterns with dynamic, intelligent rate limiting.
 */

// ============================================================================
// Pacer — Token-bucket-like concurrent executor
// ============================================================================

/**
 * A semaphore-style concurrent executor.
 * Runs functions immediately if under the concurrency limit,
 * otherwise queues and waits for a slot to become available.
 *
 * @example
 * const pacer = new Pacer(3); // max 3 concurrent calls
 * await pacer.run(async () => {
 *   const result = await someApiCall();
 *   return result;
 * });
 */
export class Pacer {
  private running = 0;
  private waiting: Array<() => void> = [];
  private lastRunAt = 0;

  constructor(private readonly concurrency: number = 2) {}

  /**
   * Execute a function, respecting the concurrency limit.
   * If under limit, runs immediately. Otherwise, waits for a slot.
   * Enforces minimum 800ms gap between calls to avoid 429 rate limits.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    // Wait for a slot if at concurrency limit
    if (this.running >= this.concurrency) {
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
      });
    }

    // Enforce minimum inter-request gap to smooth burst
    const now = Date.now();
    const elapsed = now - this.lastRunAt;
    if (elapsed < 2000) {
      await sleep(2000 - elapsed);
    }

    this.running++;
    this.lastRunAt = Date.now();

    try {
      return await fn();
    } finally {
      this.running--;
      // Release one waiting task if any
      const next = this.waiting.shift();
      if (next) {
        next();
      }
    }
  }
}

// ============================================================================
// withRetry — Exponential backoff retry for API calls
// ============================================================================

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 2) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 3000) */
  baseDelayMs?: number;
  /** Maximum delay cap in milliseconds (default: 60000) */
  maxDelayMs?: number;
  /**
   * Predicate to determine if an error should trigger a retry.
   * Receives the error and current attempt number.
   * Default: retry on HTTP 429 (rate limit) or 500+ errors.
   */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/**
 * Execute a function with exponential backoff retry.
 *
 * @example
 * const result = await withRetry(
 *   () => api.call(),
 *   { maxRetries: 3, baseDelayMs: 500 }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 3000,
    maxDelayMs = 60000,
    shouldRetry = defaultShouldRetry,
  } = options ?? {};

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt < maxRetries && shouldRetry(error, attempt)) {
        // Calculate exponential backoff delay
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
        await sleep(delay);
      } else {
        // No more retries or should not retry — throw the last error
        throw error;
      }
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError;
}

/**
 * Default retry predicate: retries on rate limit (429) or server errors (500+).
 */
function defaultShouldRetry(error: unknown, _attempt: number): boolean {
  if (error && typeof error === 'object') {
    // Handle fetch Response errors
    const status = (error as { status?: number }).status;
    if (typeof status === 'number') {
      return status === 429 || (status >= 500 && status < 600);
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Usage Example
// ============================================================================

/**
 * // Instead of:
 * await new Promise((r) => setTimeout(r, 1500)); // bad!
 *
 * // Do:
 * const pacer = new Pacer(3); // max 3 concurrent calls
 * await pacer.run(async () => {
 *   const result = await someApiCall();
 *   return result;
 * });
 * // The pacer automatically ensures max 3 run() calls happen concurrently
 *
 * // Combine with retry for robust API calls:
 * await pacer.run(() =>
 *   withRetry(() => api.call(), { maxRetries: 2 })
 * );
 */

// ============================================================================
// Barrel Export Update Hint
// ============================================================================
// Add to @/lib/reading/index.ts:
// export { Pacer, withRetry, RetryOptions } from './concurrency';
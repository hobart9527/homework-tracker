import { describe, expect, it, vi } from "vitest";
import {
  claimPlatformSyncJob,
  completePlatformSyncJob,
  restartPlatformSyncJob,
  markPlatformSyncJobFailed,
  markPlatformAccountAttentionRequired,
} from "@/lib/platform-sync";

describe("claimPlatformSyncJob", () => {
  it("creates one running sync job for a platform account and execution window", async () => {
    const insertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "sync-job-1",
            platform_account_id: "acct-1",
            trigger_mode: "scheduled",
            status: "running",
            window_key: "2026-04-20T15:30",
          },
          error: null,
        }),
      })),
    }));

    const supabase = {
      from: vi.fn(() => ({
        insert: insertMock,
      })),
    };

    const result = await claimPlatformSyncJob({
      supabase: supabase as any,
      platformAccountId: "acct-1",
      triggerMode: "scheduled",
      windowKey: "2026-04-20T15:30",
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        platform_account_id: "acct-1",
        trigger_mode: "scheduled",
        status: "running",
        window_key: "2026-04-20T15:30",
        retry_count: 0,
      })
    );
    expect(result).toMatchObject({
      status: "claimed",
      job: {
        id: "sync-job-1",
      },
    });
  });

  it("treats duplicate sync claims for the same account and window as already running", async () => {
    const supabase = {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: {
                message:
                  "duplicate key value violates unique constraint platform_sync_jobs_account_window_key",
              },
            }),
          })),
        })),
      })),
    };

    const result = await claimPlatformSyncJob({
      supabase: supabase as any,
      platformAccountId: "acct-1",
      triggerMode: "scheduled",
      windowKey: "2026-04-20T15:30",
    });

    expect(result).toMatchObject({
      status: "duplicate",
      job: null,
    });
  });
});

describe("markPlatformSyncJobFailed", () => {
  it("stores a retryable failure on the sync job and leaves the account in failed state", async () => {
    const jobUpdateMock = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));
    const accountUpdateMock = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "platform_sync_jobs") {
          return {
            update: jobUpdateMock,
          };
        }

        return {
          update: accountUpdateMock,
        };
      }),
    };

    await markPlatformSyncJobFailed({
      supabase: supabase as any,
      jobId: "sync-job-1",
      platformAccountId: "acct-1",
      errorSummary: "Unexpected IXL page shape",
      retryCount: 2,
      nextRetryAt: "2026-04-20T16:00:00.000Z",
    });

    expect(jobUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error_summary: "Unexpected IXL page shape",
        retry_count: 2,
        next_retry_at: "2026-04-20T16:00:00.000Z",
      })
    );
    expect(accountUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        last_sync_error_summary: "Unexpected IXL page shape",
      })
    );
  });
});

describe("restartPlatformSyncJob", () => {
  it("moves a failed job back to running before retry execution", async () => {
    const jobUpdateMock = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));

    const supabase = {
      from: vi.fn(() => ({
        update: jobUpdateMock,
      })),
    };

    await restartPlatformSyncJob({
      supabase: supabase as any,
      jobId: "sync-job-1",
      retryCount: 2,
    });

    expect(jobUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "running",
        retry_count: 2,
        next_retry_at: null,
        error_summary: null,
        finished_at: null,
        started_at: expect.any(String),
      })
    );
  });
});

describe("completePlatformSyncJob", () => {
  it("marks the sync job complete and stamps the platform account sync time", async () => {
    const jobUpdateMock = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));
    const accountUpdateMock = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "platform_sync_jobs") {
          return {
            update: jobUpdateMock,
          };
        }

        return {
          update: accountUpdateMock,
        };
      }),
    };

    await completePlatformSyncJob({
      supabase: supabase as any,
      jobId: "sync-job-1",
      platformAccountId: "acct-1",
      rawSummary: { importedCount: 3 },
    });

    expect(jobUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        raw_summary: { importedCount: 3 },
      })
    );
    expect(accountUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        last_synced_at: expect.any(String),
      })
    );
  });
});

describe("markPlatformAccountAttentionRequired", () => {
  it("updates the account to attention_required and records the sync failure on the job", async () => {
    const jobUpdateMock = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));
    const accountUpdateMock = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "platform_sync_jobs") {
          return {
            update: jobUpdateMock,
          };
        }

        return {
          update: accountUpdateMock,
        };
      }),
    };

    await markPlatformAccountAttentionRequired({
      supabase: supabase as any,
      jobId: "sync-job-1",
      platformAccountId: "acct-1",
      errorSummary: "Session expired",
    });

    expect(accountUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "attention_required",
      })
    );
    expect(jobUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "attention_required",
        error_summary: "Session expired",
      })
    );
  });
});

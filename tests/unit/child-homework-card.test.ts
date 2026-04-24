import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ChildHomeworkCard contract", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/child/ChildHomeworkCard.tsx"),
    "utf8"
  );

  it("avoids rendering the completed badge next to the title", () => {
    expect(source).toMatch(/isOverdue && !isCompleted/);
    expect(source).toMatch(/!isCompleted \?/);
    expect(source).not.toMatch(/isCompleted \? \(\s*<span className="rounded-full bg-primary\/10/);
  });

  it("shows an attachment entry point after proof has been submitted", () => {
    expect(source).toMatch(/Boolean\(attachmentCheckInId\)/);
    expect(source).toMatch(/查看已提交附件/);
    expect(source).toMatch(/attachments\.length > 0/);
    expect(source).toMatch(/attachmentUploadStatus\?\.state === "uploaded"/);
  });

  it("shows audio attachment upload progress on the task card", () => {
    expect(source).toMatch(/attachmentUploadStatus/);
    expect(source).toMatch(/attachmentUploadStatus\?\.checkInId/);
    expect(source).toMatch(/录音上传中/);
    expect(source).toMatch(/Math\.round\(attachmentUploadStatus\.progress\)/);
  });
});

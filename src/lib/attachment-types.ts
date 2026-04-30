export type AttachmentUploadStatus = {
  homeworkId: string;
  checkInId: string;
  state: "uploading" | "uploaded" | "failed";
  progress: number;
  message?: string;
};

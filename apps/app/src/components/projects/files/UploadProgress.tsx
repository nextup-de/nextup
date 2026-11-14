"use client";
import type { FilesPartProps } from "./types";

/** A stub: its task fills it without touching FilesView. */
export function UploadProgress(props: FilesPartProps) {
  void props;
  return <div data-testid="files-upload-progress" />;
}

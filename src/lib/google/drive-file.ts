const DRIVE_FILE_ID = /^[\w-]{10,128}$/;

export function isDriveFileId(value: string): boolean {
  return DRIVE_FILE_ID.test(value);
}

export function driveFileIdFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }
  if (isDriveFileId(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = trimmed.startsWith("http")
      ? new URL(trimmed)
      : new URL(trimmed, "https://local.invalid");
    const apiMatch = parsed.pathname.match(/\/api\/receipts\/files\/([^/]+)$/);
    if (apiMatch?.[1]) {
      const id = decodeURIComponent(apiMatch[1]);
      if (isDriveFileId(id)) {
        return id;
      }
    }
    const pathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
    if (pathMatch?.[1] && isDriveFileId(pathMatch[1])) {
      return pathMatch[1];
    }
    const id = parsed.searchParams.get("id");
    if (id && isDriveFileId(id)) {
      return id;
    }
  } catch {
    return null;
  }
  return null;
}

export function receiptImagePath(fileId: string): string {
  return `/api/receipts/files/${encodeURIComponent(fileId)}`;
}

export function receiptImageUrl(origin: string, fileId: string): string {
  return `${origin}${receiptImagePath(fileId)}`;
}

export function viewableReceiptUrl(fileUrl: string): string {
  const id = driveFileIdFromUrl(fileUrl);
  return id ? receiptImagePath(id) : fileUrl;
}

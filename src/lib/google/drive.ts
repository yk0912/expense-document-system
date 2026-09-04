import { Readable } from "node:stream";

import { google, type drive_v3 } from "googleapis";

import { createMemoryTtlCache } from "@/lib/cache/memory-ttl";
import { toGoogleErrorMessage } from "@/lib/google/errors";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const folderCache = createMemoryTtlCache<string>(30 * 60 * 1000);

export type UploadedDriveFile = {
  id: string;
  name: string;
  webViewLink: string;
};

function driveClient(auth: Parameters<typeof google.drive>[0]["auth"]) {
  return google.drive({ version: "v3", auth });
}

async function findChildFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<string | null> {
  const response = await drive.files.list({
    q: [
      `'${parentId}' in parents`,
      `name = '${name.replaceAll("'", "\\'")}'`,
      `mimeType = '${FOLDER_MIME}'`,
      "trashed = false",
    ].join(" and "),
    fields: "files(id, name)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return response.data.files?.[0]?.id ?? null;
}

async function createFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<string> {
  const response = await drive.files.create({
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  if (!response.data.id) {
    throw new Error(`フォルダ「${name}」の作成に失敗しました。`);
  }

  return response.data.id;
}

export async function ensureNamedFolder(
  auth: Parameters<typeof google.drive>[0]["auth"],
  parentId: string,
  name: string,
): Promise<string> {
  const cacheKey = `${parentId}:${name}`;
  const cached = folderCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const drive = driveClient(auth);
  try {
    const id =
      (await findChildFolder(drive, parentId, name)) ??
      (await createFolder(drive, parentId, name));
    folderCache.set(cacheKey, id);
    return id;
  } catch (error) {
    throw new Error(toGoogleErrorMessage(error, "Driveフォルダの準備に失敗しました。"));
  }
}

async function findChildFile(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<string | null> {
  const response = await drive.files.list({
    q: [
      `'${parentId}' in parents`,
      `name = '${name.replaceAll("'", "\\'")}'`,
      "trashed = false",
    ].join(" and "),
    fields: "files(id, name)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return response.data.files?.[0]?.id ?? null;
}

export async function readJsonFile<T>(
  auth: Parameters<typeof google.drive>[0]["auth"],
  folderId: string,
  fileName: string,
): Promise<T | null> {
  const drive = driveClient(auth);
  const fileId = await findChildFile(drive, folderId, fileName);
  if (!fileId) {
    return null;
  }
  const response = await drive.files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: true,
    },
    { responseType: "text" },
  );
  const raw = typeof response.data === "string" ? response.data : String(response.data);
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(
  auth: Parameters<typeof google.drive>[0]["auth"],
  folderId: string,
  fileName: string,
  data: unknown,
): Promise<void> {
  const drive = driveClient(auth);
  const body = JSON.stringify(data, null, 2);
  const existingId = await findChildFile(drive, folderId, fileName);
  const media = {
    mimeType: "application/json",
    body,
  };

  if (existingId) {
    await drive.files.update({
      fileId: existingId,
      media,
      supportsAllDrives: true,
    });
    return;
  }

  await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType: "application/json",
    },
    media,
    supportsAllDrives: true,
  });
}

export async function ensureYearMonthFolder(
  auth: Parameters<typeof google.drive>[0]["auth"],
  rootFolderId: string,
  year: string,
  month: string,
): Promise<string> {
  const monthKey = `${rootFolderId}:${year}:${month}`;
  const cachedMonth = folderCache.get(monthKey);
  if (cachedMonth) {
    return cachedMonth;
  }

  const drive = driveClient(auth);

  try {
    const yearKey = `${rootFolderId}:${year}`;
    const yearId =
      folderCache.get(yearKey) ??
      (await findChildFolder(drive, rootFolderId, year)) ??
      (await createFolder(drive, rootFolderId, year));
    folderCache.set(yearKey, yearId);

    const monthId =
      (await findChildFolder(drive, yearId, month)) ??
      (await createFolder(drive, yearId, month));
    folderCache.set(monthKey, monthId);
    return monthId;
  } catch (error) {
    throw new Error(toGoogleErrorMessage(error, "Driveフォルダの準備に失敗しました。"));
  }
}

export async function uploadReceiptImage(
  auth: Parameters<typeof google.drive>[0]["auth"],
  folderId: string,
  fileName: string,
  image: Buffer,
): Promise<UploadedDriveFile> {
  const drive = driveClient(auth);

  try {
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
        mimeType: "image/jpeg",
      },
      media: {
        mimeType: "image/jpeg",
        body: Readable.from(image),
      },
      fields: "id, name, webViewLink",
      supportsAllDrives: true,
    });

    const id = response.data.id;
    const name = response.data.name ?? fileName;
    if (!id) {
      throw new Error("Driveへの画像保存に失敗しました。");
    }

    await shareFileAnyoneReader(drive, id);

    return {
      id,
      name,
      webViewLink:
        response.data.webViewLink ?? `https://drive.google.com/file/d/${id}/view`,
    };
  } catch (error) {
    throw new Error(toGoogleErrorMessage(error, "Driveへの画像保存に失敗しました。"));
  }
}

async function shareFileAnyoneReader(
  drive: drive_v3.Drive,
  fileId: string,
): Promise<void> {
  try {
    await drive.permissions.create({
      fileId,
      requestBody: {
        type: "anyone",
        role: "reader",
      },
      supportsAllDrives: true,
    });
  } catch {
    // 組織設定で公開共有できない場合でも、アプリ経由の表示は続ける。
  }
}

export async function downloadDriveFile(
  auth: Parameters<typeof google.drive>[0]["auth"],
  fileId: string,
): Promise<{ name: string; mimeType: string; body: Buffer }> {
  const drive = driveClient(auth);
  try {
    const meta = await drive.files.get({
      fileId,
      fields: "id, name, mimeType",
      supportsAllDrives: true,
    });
    const mimeType = meta.data.mimeType ?? "";
    if (!mimeType.startsWith("image/")) {
      throw new Error("画像ファイルではありません。");
    }
    const media = await drive.files.get(
      {
        fileId,
        alt: "media",
        supportsAllDrives: true,
      },
      { responseType: "arraybuffer" },
    );
    const raw = media.data;
    const body = Buffer.isBuffer(raw)
      ? raw
      : Buffer.from(raw as ArrayBuffer);
    return {
      name: meta.data.name ?? fileId,
      mimeType,
      body,
    };
  } catch (error) {
    throw new Error(toGoogleErrorMessage(error, "画像の取得に失敗しました。"));
  }
}

export async function deleteDriveFile(
  auth: Parameters<typeof google.drive>[0]["auth"],
  fileId: string,
): Promise<void> {
  const drive = driveClient(auth);
  try {
    await drive.files.delete({
      fileId,
      supportsAllDrives: true,
    });
  } catch {
    // 登録失敗時の後始末。削除できなくても登録自体は失敗のまま返す。
  }
}

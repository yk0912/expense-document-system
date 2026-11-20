import { useGoogleAttendanceSpreadsheet } from "@/lib/google/attendance-sheet";
import { spreadsheetUrlFromId } from "@/lib/settings/parse";
import { saveAppSettings } from "@/lib/settings/server";
import type { AppSettings } from "@/lib/settings/types";

type AttendanceAuth = Parameters<typeof useGoogleAttendanceSpreadsheet>[0];

export async function runWithAttendanceDestination<T>(
  auth: AttendanceAuth,
  settings: AppSettings,
  run: (spreadsheetId: string) => Promise<T>,
): Promise<T> {
  const opened = await useGoogleAttendanceSpreadsheet(
    auth,
    settings.attendanceSpreadsheetId,
    run,
  );
  if (opened.converted) {
    await saveAppSettings({
      ...settings,
      attendanceSpreadsheetId: opened.spreadsheetId,
      attendanceSpreadsheetUrl: spreadsheetUrlFromId(opened.spreadsheetId),
    });
  }
  return opened.value;
}

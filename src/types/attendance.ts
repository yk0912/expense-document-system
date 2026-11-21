export type AttendanceDay = {
  day: number;
  workStart: string | null;
  workEnd: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  actualHours: number | null;
  earlyHours: number | null;
  transportYen: number | null;
  note: string | null;
  supervisorSigned: boolean | null;
  overtimeApproved: boolean | null;
  cleared: boolean;
  warnings: string[];
};

export type ReviewAttendance = {
  clientId: string;
  sheetIndex: number;
  employeeName: string;
  year: number | null;
  month: number | null;
  headerNote: string | null;
  days: AttendanceDay[];
  warnings: string[];
};

export type AttendanceAnalyzeResponse = {
  sheets: ReviewAttendance[];
};

export type AttendanceDirectory = {
  spreadsheetUrl: string;
  sheetName: string;
  names: string[];
  headerYear: number | null;
  headerMonth: number | null;
  headerLabel: string | null;
};

export type AttendanceRegisterResult = {
  sheetIndex: number;
  employeeName: string;
  ok: boolean;
  rowNumber: number | null;
  writtenDays: number;
  clearedDays: number;
  overwriteDayCount: number;
  resetsWriteArea: boolean;
  nameInserted: boolean;
  error: string | null;
  headerWarning: string | null;
};

export type AttendanceRegisterResponse = {
  needsConfirm: boolean;
  overwriteDayCount: number;
  results: AttendanceRegisterResult[];
};

export type AttendanceWriteDay = {
  day: number;
  actualHours: number | null;
  earlyHours: number | null;
  transportYen: number | null;
  cleared: boolean;
};

export type AttendanceWriteSheet = {
  sheetIndex: number;
  employeeName: string;
  year: number | null;
  month: number | null;
  days: AttendanceWriteDay[];
};

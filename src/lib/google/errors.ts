export function toGoogleErrorMessage(error: unknown, fallback: string): string {
  const gaxios = error as {
    message?: string;
    response?: {
      data?: { error?: string | { message?: string; status?: string } };
    };
  };
  const data = gaxios.response?.data?.error;
  const raw =
    typeof data === "string"
      ? data
      : data?.message ?? gaxios.message ?? fallback;

  if (raw.includes("invalid_grant")) {
    return "Googleのrefresh tokenが無効です。OAuth Playgroundでrefresh_tokenを取り直してください。";
  }
  if (
    raw.toLowerCase().includes("office file") ||
    raw.toLowerCase().includes("not supported for this document")
  ) {
    return "指定したファイルは Excel のままです。Google スプレッドシートのIDを使ってください。";
  }
  if (raw.includes("Requested entity was not found") || raw.includes("File not found")) {
    return "Google Driveの保存先フォルダにアクセスできません。フォルダIDを確認するか、OAuthスコープに https://www.googleapis.com/auth/drive を追加してtokenを取り直してください。";
  }
  if (raw.includes("insufficientPermissions") || raw.includes("insufficient authentication")) {
    return "Google Driveへの保存権限がありません。OAuthスコープに Drive を追加してtokenを取り直してください。";
  }

  return raw;
}

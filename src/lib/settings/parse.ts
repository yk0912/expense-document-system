export function parseSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (fromUrl?.[1]) {
    return fromUrl[1];
  }
  return trimmed;
}

export function parseDriveFolderId(input: string): string {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  if (fromUrl?.[1]) {
    return fromUrl[1];
  }
  return trimmed;
}

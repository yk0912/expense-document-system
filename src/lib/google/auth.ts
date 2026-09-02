import { google } from "googleapis";

import { loadServerEnv } from "@/lib/env";

export async function describeGoogleCredentialIssue(): Promise<string | null> {
  const env = await loadServerEnv();
  const clientId = env.googleClientId;
  const clientSecret = env.googleClientSecret;
  const refreshToken = env.googleRefreshToken;

  if (!clientId || !clientSecret || !refreshToken) {
    return "Google認証情報が未設定のため、経費区分を取得できませんでした。";
  }

  if (refreshToken.startsWith("4/")) {
    return "GOOGLE_REFRESH_TOKEN に認可コード（4/ で始まる値）が入っています。OAuth Playground で「Exchange authorization code for tokens」を押したあと、右側に出る refresh_token（1// で始まる値）を .env.local に入れて、開発サーバーを再起動してください。";
  }

  if (refreshToken.startsWith("ya29.")) {
    return "GOOGLE_REFRESH_TOKEN に access_token が入っています。右側の refresh_token（1// で始まる値）を入れて、開発サーバーを再起動してください。";
  }

  return null;
}

export async function createGoogleOAuthClient() {
  const env = await loadServerEnv();
  const clientId = env.googleClientId;
  const clientSecret = env.googleClientSecret;
  const refreshToken = env.googleRefreshToken;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

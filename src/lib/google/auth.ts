import { google } from "googleapis";

import { loadServerEnv, missingGoogleAuthKeys } from "@/lib/env";

export function describeGoogleCredentialIssue(): string | null {
  const env = loadServerEnv();
  const missing = missingGoogleAuthKeys(env);
  if (missing.length > 0) {
    return `Google認証情報が未設定です。（${missing.join("、")}）`;
  }

  const refreshToken = env.googleRefreshToken;
  if (refreshToken.startsWith("4/")) {
    return "GOOGLE_REFRESH_TOKEN に認可コード（4/ で始まる値）が入っています。OAuth Playground で「Exchange authorization code for tokens」を押したあと、右側に出る refresh_token（1// で始まる値）を .env.local に入れて、開発サーバーを再起動してください。";
  }

  if (refreshToken.startsWith("ya29.")) {
    return "GOOGLE_REFRESH_TOKEN に access_token が入っています。右側の refresh_token（1// で始まる値）を入れて、開発サーバーを再起動してください。";
  }

  return null;
}

export function createGoogleOAuthClient() {
  const env = loadServerEnv();
  if (missingGoogleAuthKeys(env).length > 0) {
    return null;
  }

  const client = new google.auth.OAuth2(env.googleClientId, env.googleClientSecret);
  client.setCredentials({ refresh_token: env.googleRefreshToken });
  return client;
}

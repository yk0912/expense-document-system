import { NextResponse } from "next/server";

import { listUsableGeminiModels } from "@/lib/ai/gemini-models";
import { requireSession } from "@/lib/auth/guard";
import { loadServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) {
    return session;
  }

  const env = loadServerEnv();
  if (!env.geminiApiKey) {
    return NextResponse.json(
      { models: [], error: "GEMINI_API_KEY が未設定です。" },
      { status: 500 },
    );
  }

  try {
    const models = await listUsableGeminiModels(env.geminiApiKey);
    return NextResponse.json({ models, source: "api" });
  } catch (error) {
    return NextResponse.json(
      {
        models: [],
        error:
          error instanceof Error
            ? error.message
            : "Geminiのモデル一覧を取得できませんでした。",
      },
      { status: 502 },
    );
  }
}

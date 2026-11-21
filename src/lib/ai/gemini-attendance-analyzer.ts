import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from "@google/genai";

import {
  geminiAttendanceAnalysisSchema,
  geminiAttendanceJsonSchema,
  sanitizeAttendanceAnalysis,
  type GeminiAttendanceAnalysis,
} from "@/lib/ai/attendance-schema";
import { resolveGeminiModel } from "@/lib/ai/gemini-models";
import { loadServerEnv } from "@/lib/env";

const PROMPT = `あなたは日本の勤務実績報告書を読み取るシステムです。

画像の中にある勤務実績報告書をすべて検出してください。1枚の写真に複数人分が写っている場合は、それぞれ別の sheets 要素にしてください。上から順に sheetIndex を 1 から振ってください。

各報告書から次を読んでください。
- employeeName: 氏名。敬称の「様」は除く。空白があってもそのまま。
- year: 西暦4桁。令和の場合は 2018 を足した年（令和8年は 2026）。読めなければ null。
- month: 1から12の月。読めなければ null。
- headerNote: 用紙上部のメモ（例: 中河原→府中）。無ければ null。
- days: 勤務の記入がある日だけ。日付だけの空欄、「. ~ .」「~」だけの行は入れない。

各日について:
- day: 1から31の日付
- workStart / workEnd: 実働時間帯。24時間表記の HH:mm。空欄なら null。
- breakStart / breakEnd: 休憩時間帯。空欄なら null。
- actualHours: 用紙に書かれた実働時間(h)。4時間半なら 4.5。書かれていなければ null。自分で計算しない。
- transportYen: 備考欄の交通費。280円なら 280。無ければ null。
- transportSameAsAbove: 交通費欄が「〃」、斜線2本のちょんちょん、または「以下同文」なら true。その場合 transportYen は null。金額が書いてある日は false。
- note: 交通費以外の備考。無ければ null。
- 数字に取り消し線が2本引いてあり、そのそばに書き直した数字があるときは、消された数字は使わない。開始・終了・休憩・実働・交通費とも、そばの代替数字を採用する。代替数字が無い取り消しは null。
- supervisorSigned: 責任者サインがあれば true、空欄なら false、判別できなければ null。
- overtimeApproved: 残業承認があれば true、空欄なら false、判別できなければ null。

推測で値を補完しないでください。読めない値は null にしてください。
warnings には、かすれて読めない箇所だけ短く入れてください。無ければ空配列です。`;

function parseThinkingLevel(raw: string | undefined): ThinkingLevel {
  switch (raw?.trim().toLowerCase()) {
    case "minimal":
      return ThinkingLevel.MINIMAL;
    case "medium":
      return ThinkingLevel.MEDIUM;
    case "high":
      return ThinkingLevel.HIGH;
    default:
      return ThinkingLevel.LOW;
  }
}

function thinkingConfigForModel(
  model: string,
  thinkingLevel: string,
): ThinkingConfig | undefined {
  const name = model.toLowerCase();
  if (name.includes("gemini-3")) {
    return {
      thinkingLevel: parseThinkingLevel(thinkingLevel),
      includeThoughts: false,
    };
  }
  if (name.includes("gemini-2.5")) {
    return {
      thinkingBudget: 1024,
      includeThoughts: false,
    };
  }
  return undefined;
}

export class GeminiAttendanceAnalyzer {
  constructor(private readonly modelName?: string) {}

  async analyze(image: Buffer, mimeType: string): Promise<GeminiAttendanceAnalysis> {
    const env = loadServerEnv();
    const apiKey = env.geminiApiKey;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY が未設定です。.env.local に設定してください。");
    }

    const model = resolveGeminiModel(this.modelName, env.geminiModel);
    const client = new GoogleGenAI({ apiKey });
    const thinkingConfig = thinkingConfigForModel(model, env.geminiThinkingLevel);
    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: image.toString("base64"),
              },
            },
            { text: PROMPT },
          ],
        },
      ],
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseJsonSchema: geminiAttendanceJsonSchema(),
        ...(thinkingConfig ? { thinkingConfig } : {}),
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Geminiから解析結果を取得できませんでした。");
    }

    return geminiAttendanceAnalysisSchema.parse(
      sanitizeAttendanceAnalysis(JSON.parse(text)),
    );
  }
}

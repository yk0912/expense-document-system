import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from "@google/genai";

import type { ReceiptAnalyzer } from "@/lib/ai/receipt-analyzer";
import {
  geminiReceiptAnalysisSchema,
  geminiResponseJsonSchema,
} from "@/lib/ai/schema";
import { loadServerEnv } from "@/lib/env";
import type { CategoryMasterItem } from "@/types/receipt";

function buildPrompt(categories: CategoryMasterItem[]): string {
  const master =
    categories.length === 0
      ? "経費区分マスタは未取得です。商品内容から一般的な経費区分名（例: 材料）を候補として返してください。判断できない場合のみ null と requiresReview true にしてください。「その他」は使わないでください。"
      : categories
          .map((category) => {
            const extras = [
              category.examples ? `具体例: ${category.examples}` : null,
              category.taxRate ? `税率: ${category.taxRate}` : null,
              category.description ? `説明: ${category.description}` : null,
            ]
              .filter(Boolean)
              .join(" / ");
            return extras ? `- ${category.name}（${extras}）` : `- ${category.name}`;
          })
          .join("\n");

  return `あなたは日本国内の経理用レシート解析システムです。

画像内に存在するすべてのレシートを検出してください。
複数枚存在する場合は、それぞれ別のreceiptオブジェクトとして返してください。

各レシートについて、
店舗名
店舗住所
取引日
小計（税抜）
消費税8%対象合計
消費税8%
消費税10%対象合計
消費税10%
支払合計（税込）
商品明細
数量
単価
金額（税抜）
税込・税抜表記
を取得してください。

推測で値を補完してはいけません。
読み取れない値はnullにしてください。
お預り、お釣り、小計、税抜金額を最終支払額と誤認しないでください。
subtotalAmount にはレシートに印字された小計（税抜）だけを入れてください。商品を足して作らないでください。小計が無い場合はnullです。
taxAmount8 / taxAmount10 にはレシートに印字された消費税額だけを入れてください。商品から計算しないでください。その税率の記載が無い場合はnullです。
taxableAmount8 / taxableAmount10 には印字された「8%対象合計」「10%対象合計」だけを入れてください。記載が無い場合はnullです。商品を足して作らないでください。
totalAmount には印字された支払合計（税込）だけを入れてください。小計や税額を足して作らないでください。
商品明細の amount と unitPrice は税抜です。item.taxRate は 0 / 1 / 8 / 10 のいずれかにしてください。食材・食品は8、備品は10、分からない場合は0です。
値引・クーポン・ポイント利用は itemType を discount / coupon / point にして、できる限り明細として返してください。
transactionDate は YYYY-MM-DD 形式にしてください。読めない場合はnullです。
boundingBox は [ymin, xmin, ymax, xmax] を 0〜1000 の正規化整数で返してください。不明ならnullです。

vendorKind を次で判定してください。
- dining: 居酒屋・ファミレス・レストラン・カフェ・喫茶・食堂・パティスリーなど、飲食店での食事や飲物。領収証に「御飲食代として」とある場合も含む。メニューが明細になっていても dining。
- retail: スーパー・コンビニ・ドラッグストア・ホームセンターなど、商品を仕入れる店。
- unknown: 上記で判断できない場合。

dining の場合:
- メニュー一つ一つに経費区分を付けないでください。suggestedCategory は null でよいです。
- suggestedLumpCategory はマスタから 会議費 または 交際費 など飲食をまとめる区分を1つ選んでください。無い場合は null。
- 合計金額はレシート/領収証の支払合計を totalAmount に入れてください。明細が無い領収証でも totalAmount は必須です。

retail の場合:
- 商品ごとにマスタから suggestedCategory を付けてください。
- suggestedLumpCategory は null。
- 判断できない商品は「その他」にせず suggestedCategory を null、requiresReview を true にしてください。

マスタに無い区分名は使わないでください。

経費区分マスタ:
${master}`;
}

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

export class GeminiReceiptAnalyzer implements ReceiptAnalyzer {
  async analyze(
    image: Buffer,
    mimeType: string,
    categories: CategoryMasterItem[],
  ) {
    const env = await loadServerEnv();
    const apiKey = env.geminiApiKey;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY が未設定です。.env.local に設定してください。");
    }

    const model = env.geminiModel || "gemini-3.5-flash-lite";
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
            { text: buildPrompt(categories) },
          ],
        },
      ],
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseJsonSchema: geminiResponseJsonSchema(),
        ...(thinkingConfig ? { thinkingConfig } : {}),
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Geminiから解析結果を取得できませんでした。");
    }

    return geminiReceiptAnalysisSchema.parse(JSON.parse(text));
  }
}

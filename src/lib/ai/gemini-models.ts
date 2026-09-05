export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

export type GeminiModelOption = {
  id: string;
  label: string;
};

export const CUSTOM_GEMINI_MODEL = "__custom__";

const EXCLUDED_MODEL = /embedding|imagen|veo|tts|audio|live|robotics|computer-use|gemma|image/i;

export function isKnownGeminiModel(
  model: string,
  options: readonly GeminiModelOption[],
): boolean {
  return options.some((option) => option.id === model);
}

/** list には残るが、この環境のキーで generateContent が 404 になるモデル */
export function isUnavailableGeminiModel(model: string): boolean {
  return model.startsWith("gemini-2.5");
}

export function resolveGeminiModel(
  ...candidates: Array<string | null | undefined>
): string {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value && !isUnavailableGeminiModel(value)) {
      return value;
    }
  }
  return DEFAULT_GEMINI_MODEL;
}

function modelIdFromName(name: string): string {
  return name.replace(/^models\//, "");
}

function isReceiptGeminiModel(id: string, methods?: string[]): boolean {
  if (!id.startsWith("gemini-")) {
    return false;
  }
  if (isUnavailableGeminiModel(id)) {
    return false;
  }
  if (EXCLUDED_MODEL.test(id)) {
    return false;
  }
  if (/-\d{3}$/.test(id) || /\d{4}-\d{2}-\d{2}/.test(id)) {
    return false;
  }
  if (methods && methods.length > 0 && !methods.includes("generateContent")) {
    return false;
  }
  return /flash|pro/.test(id);
}

type GeminiListModel = {
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
};

export async function listUsableGeminiModels(
  apiKey: string,
): Promise<GeminiModelOption[]> {
  const found = new Map<string, GeminiModelOption>();
  let pageToken = "";

  for (let page = 0; page < 8; page += 1) {
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("pageSize", "100");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Geminiのモデル一覧を取得できませんでした。");
    }

    const payload = (await response.json()) as {
      models?: GeminiListModel[];
      nextPageToken?: string;
    };

    for (const model of payload.models ?? []) {
      const id = modelIdFromName(model.name ?? "");
      if (!isReceiptGeminiModel(id, model.supportedGenerationMethods)) {
        continue;
      }
      found.set(id, {
        id,
        label: model.displayName?.trim() || id,
      });
    }

    pageToken = payload.nextPageToken ?? "";
    if (!pageToken) {
      break;
    }
  }

  return [...found.values()].sort((left, right) =>
    left.id.localeCompare(right.id, "en"),
  );
}

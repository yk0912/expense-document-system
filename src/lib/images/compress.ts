const TARGET_BYTES = 1_000_000;

export type CompressedReceiptImage = {
  blob: Blob;
  previewUrl: string;
  originalBytes: number;
  compressedBytes: number;
  width: number;
  height: number;
  mimeType: string;
  usedOriginal: boolean;
  warning: string | null;
};

function maxEdge(): number {
  if (typeof navigator !== "undefined" && /iP(hone|ad|od)/.test(navigator.userAgent)) {
    return 1024;
  }
  return 1600;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("JPEGへの変換に失敗しました"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

function scaledSize(width: number, height: number, edge: number) {
  const scale = Math.min(1, edge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function drawFileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const edge = maxEdge();

  if (typeof createImageBitmap === "function") {
    const original = await createImageBitmap(file);
    const { width, height } = scaledSize(original.width, original.height, edge);
    let source: ImageBitmap = original;

    try {
      if (width !== original.width || height !== original.height) {
        source = await createImageBitmap(original, {
          resizeWidth: width,
          resizeHeight: height,
          resizeQuality: "medium",
        });
        original.close();
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        throw new Error("canvas を初期化できませんでした");
      }
      context.drawImage(source, 0, 0, width, height);
      return canvas;
    } finally {
      source.close();
    }
  }

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const element = new Image();
    element.onload = () => {
      URL.revokeObjectURL(url);
      resolve(element);
    };
    element.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像を読み込めませんでした"));
    };
    element.src = url;
  });

  const { width, height } = scaledSize(image.width, image.height, edge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("canvas を初期化できませんでした");
  }
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

export async function compressReceiptImage(
  file: File,
): Promise<CompressedReceiptImage> {
  const originalBytes = file.size;

  try {
    const canvas = await drawFileToCanvas(file);
    const width = canvas.width;
    const height = canvas.height;
    const blob = await canvasToBlob(canvas, 0.72);
    canvas.width = 0;
    canvas.height = 0;

    return {
      blob,
      previewUrl: URL.createObjectURL(blob),
      originalBytes,
      compressedBytes: blob.size,
      width,
      height,
      mimeType: "image/jpeg",
      usedOriginal: false,
      warning:
        blob.size > TARGET_BYTES
          ? "1MBを超えています。もう少し離して撮り直すか、明るい場所で撮影してください。"
          : null,
    };
  } catch {
    return {
      blob: file,
      previewUrl: URL.createObjectURL(file),
      originalBytes,
      compressedBytes: originalBytes,
      width: 0,
      height: 0,
      mimeType: file.type || "application/octet-stream",
      usedOriginal: true,
      warning:
        "この形式は圧縮できませんでした。JPEG/PNGで撮り直すか、そのまま次へ進んでください。",
    };
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

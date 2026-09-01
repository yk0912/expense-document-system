const TTL_MS = 30 * 60 * 1000;

type StoredReceiptImage = {
  image: Buffer;
  mimeType: string;
  expiresAt: number;
};

const store = new Map<string, StoredReceiptImage>();

function pruneExpired() {
  const now = Date.now();
  for (const [token, entry] of store) {
    if (entry.expiresAt <= now) {
      store.delete(token);
    }
  }
}

export function storeReceiptImage(image: Buffer, mimeType: string): string {
  pruneExpired();
  const token = crypto.randomUUID();
  store.set(token, {
    image,
    mimeType,
    expiresAt: Date.now() + TTL_MS,
  });
  return token;
}

export function getReceiptImage(
  token: string,
): { image: Buffer; mimeType: string } | null {
  pruneExpired();
  const entry = store.get(token.trim());
  if (!entry) {
    return null;
  }
  return { image: entry.image, mimeType: entry.mimeType };
}

export function consumeReceiptImage(token: string) {
  store.delete(token.trim());
}

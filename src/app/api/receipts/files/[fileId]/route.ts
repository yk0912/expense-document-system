import { serveReceiptFile } from "@/lib/google/receipt-file-serve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(
  _request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await context.params;
  return serveReceiptFile(decodeURIComponent(fileId));
}

import { serveReceiptFile } from "@/lib/google/receipt-file-serve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const fileId = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  return serveReceiptFile(fileId);
}

import { GET as downloadFile } from "../route";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; filename: string }> };

export async function GET(request: Request, context: Context) {
  // The filename helps desktop Office recognize the type. ID remains the only lookup key.
  return downloadFile(request, context);
}

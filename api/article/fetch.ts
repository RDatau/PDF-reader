import type { IncomingMessage, ServerResponse } from "http";
import { ArticleFetchError, extractCleanArticleFromUrl } from "../../lib/articleExtractor";

interface VercelApiRequest extends IncomingMessage {
  body?: any;
}

interface VercelApiResponse extends ServerResponse {
  status: (code: number) => VercelApiResponse;
  json: (data: any) => void;
}

async function readJsonBody(req: VercelApiRequest): Promise<any> {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  if (typeof req.body === "string" && req.body.trim()) {
    return JSON.parse(req.body);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function sendJson(res: VercelApiResponse, statusCode: number, payload: unknown): void {
  if (typeof res.status === "function" && typeof res.json === "function") {
    res.status(statusCode).json(payload);
    return;
  }
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export default async function handler(req: VercelApiRequest, res: VercelApiResponse) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed. Gunakan POST." });
    return;
  }

  try {
    const body = await readJsonBody(req).catch(() => ({}));
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";

    const article = await extractCleanArticleFromUrl(rawUrl);
    sendJson(res, 200, { ok: true, article });
  } catch (error: any) {
    const statusCode =
      error instanceof ArticleFetchError ? error.statusCode : 502;
    sendJson(res, statusCode, {
      ok: false,
      error: error?.message || "Gagal mengambil dan membersihkan artikel situs.",
    });
  }
}

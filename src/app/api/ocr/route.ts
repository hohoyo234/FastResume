import { NextResponse } from "next/server";
export const runtime = 'nodejs';
export const maxDuration = 60;

// Render PDF pages server-side and run OCR with tesseract.js
// Avoid pdf.js worker by disabling it and provide a Node canvas factory.

type OcrLang = "auto" | "eng" | "chi_sim";

// Minimal Node CanvasFactory using @napi-rs/canvas
class NodeCanvasFactory {
  create(width: number, height: number) {
    const { createCanvas, ImageData } = require("@napi-rs/canvas");
    const canvas = createCanvas(Math.floor(width), Math.floor(height));
    const context = canvas.getContext("2d");
    return { canvas, context, ImageData };
  }
  reset(canvasAndContext: any, width: number, height: number) {
    const { createCanvas } = require("@napi-rs/canvas");
    const canvas = createCanvas(Math.floor(width), Math.floor(height));
    const context = canvas.getContext("2d");
    canvasAndContext.canvas = canvas;
    canvasAndContext.context = context;
  }
  destroy(canvasAndContext: any) {
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

async function ocrPdfBuffer(buf: Buffer, pages: number, lang: OcrLang): Promise<string> {
  const u8 = new Uint8Array(buf);
  let pdfjs: any;
  // Prefer CommonJS legacy build to avoid Next bundler resolving pdf.worker.mjs
  try {
    const { createRequire } = await import("module");
    const req = createRequire(import.meta.url);
    pdfjs = req("pdfjs-dist/legacy/build/pdf.js");
  } catch {
    try {
      pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    } catch {
      pdfjs = await import("pdfjs-dist/build/pdf.mjs");
    }
  }
  try { if (pdfjs?.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = undefined as any; } catch {}

  const loadingTask = pdfjs.getDocument({ data: u8, disableWorker: true, isEvalSupported: false });
  const doc = await loadingTask.promise;
  const total = doc.numPages || 1;
  const maxPages = Math.max(1, Math.min(10, pages || 6));

  // Prepare OCR worker
  const TesseractMod: any = await import("tesseract.js");
  const langParam = lang === "auto" ? "eng+chi_sim" : lang;

  // Use CDN for lang/core on server side (browser CSP no longer applies)
  const langPath = "https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0";

  let textAll = "";
  const canvasFactory = new NodeCanvasFactory();

  const pagesToProcess = Math.min(total, maxPages);
  for (let i = 1; i <= pagesToProcess; i++) {
    try {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const { canvas, context } = canvasFactory.create(viewport.width, viewport.height);
      await page.render({ canvasContext: context, viewport, canvasFactory }).promise;
      // @napi-rs/canvas: toBuffer returns PNG by default
      const imgBuf: Buffer = (canvas as any).toBuffer("image/png");
      const result = await TesseractMod.recognize(imgBuf, langParam, { langPath });
      const pageText: string = result?.data?.text || result?.text || "";
      textAll += (pageText || "") + "\n\n";
    } catch (e: any) {
      // Continue other pages even if one fails
    }
  }

  return (textAll || "").trim();
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    const pagesRaw = form.get("pages");
    const langRaw = (form.get("lang") as string | null) || "auto";
    const pages = Math.max(1, Math.min(10, parseInt(String(pagesRaw || "6"), 10) || 6));
    const lang = (langRaw === "eng" || langRaw === "chi_sim" || langRaw === "auto") ? (langRaw as OcrLang) : "auto";

    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "仅支持 PDF 文件进行 OCR" }, { status: 400 });
    }
    const isPdf = file.type?.toLowerCase().includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json({ error: "仅支持 PDF 文件进行 OCR" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const text = await ocrPdfBuffer(buf, pages, lang);
    if (!text || text.trim().length < 10) {
      return NextResponse.json({ error: "OCR 未识别到有效文本。请尝试增大页数或更换语言。" }, { status: 400 });
    }

    return NextResponse.json({ text }, { status: 200 });
  } catch (e: any) {
    const msgZh = e?.message || "服务端 OCR 失败，请稍后重试";
    return NextResponse.json({ error: msgZh }, { status: 500 });
  }
}
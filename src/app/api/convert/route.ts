import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

async function pdfToText(buf: Buffer): Promise<string> {
  try {
    const pdfModule: any = await import("pdf-parse");
    const pdfParse = pdfModule?.default ?? pdfModule;
    const out = await pdfParse(buf);
    const text = (out?.text as string) || "";
    if (text && text.trim().length > 0) return text.trim();
  } catch {}
  try {
    let pdfjs: any;
    try {
      pdfjs = await import("pdfjs-dist/build/pdf.mjs");
    } catch {
      pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    }
    try { pdfjs.GlobalWorkerOptions.workerSrc = undefined as any; } catch {}
    const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const loadingTask = pdfjs.getDocument({ data: u8, disableWorker: true });
    const doc = await loadingTask.promise;
    let text = "";
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const pageText = (content.items || []).map((it: any) => it.str).join(" ");
      text += pageText + "\n";
    }
    try { await doc.destroy(); } catch {}
    return text.trim();
  } catch {}
  return "";
}

async function textToDocxBuffer(text: string): Promise<Buffer> {
  const mod = await import("docx");
  const { Document, Packer, Paragraph } = mod as any;
  const paras = (text || "").split(/\r?\n/).map((line: string) => new Paragraph(line));
  const doc = new Document({ sections: [{ properties: {}, children: paras }] });
  const buf = await Packer.toBuffer(doc);
  return Buffer.from(buf);
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const format = (form.get("format") as string | null)?.toLowerCase() || "txt";

    if (!file) return NextResponse.json({ error: "未接收到文件" }, { status: 400 });
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || /pdf$/i.test(file.type || "");
    if (!isPdf) return NextResponse.json({ error: "仅支持 PDF 文件转换" }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const text = await pdfToText(buf);
    if (!text || text.trim().length < 5) {
      return NextResponse.json({ error: "无法从该 PDF 提取文本，可能是扫描件或图片。后续将补充服务端 OCR。" }, { status: 400 });
    }

    if (format === 'txt') {
      const filename = (file.name.replace(/\.pdf$/i, '') || 'converted') + '-converted.txt';
      return new NextResponse(text, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (format === 'docx' || format === 'word') {
      const docxBuf = await textToDocxBuffer(text);
      const blob = new Blob([new Uint8Array(docxBuf)], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const filename = (file.name.replace(/\.pdf$/i, '') || 'converted') + '-converted.docx';
      return new NextResponse(blob, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    return NextResponse.json({ error: '不支持的格式' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '转换失败' }, { status: 500 });
  }
}
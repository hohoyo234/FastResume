declare module "pdfjs-dist/build/pdf.mjs" {
  /** Minimal typing for pdfjs-dist ESM build used in API route */
  export function getDocument(src: any): { promise: Promise<any> };
}

declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  /** Minimal typing for pdfjs-dist legacy ESM build used as fallback */
  export function getDocument(src: any): { promise: Promise<any> };
}
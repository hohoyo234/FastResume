declare module 'html2pdf.js' {
  const html2pdf: any;
  export default html2pdf;
}

declare module 'html2pdf.js/dist/html2pdf.bundle.js' {
  const html2pdf: any;
  export default html2pdf;
}

// Minified bundle variant (used as fallback)
declare module 'html2pdf.js/dist/html2pdf.bundle.min.js' {
  const html2pdf: any;
  export default html2pdf;
}

// Core builds in case we switch imports later
declare module 'html2pdf.js/dist/html2pdf.js' {
  const html2pdf: any;
  export default html2pdf;
}

declare module 'html2pdf.js/dist/html2pdf.min.js' {
  const html2pdf: any;
  export default html2pdf;
}
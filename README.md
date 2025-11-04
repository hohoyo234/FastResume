# FastResume

This is a Next.js app for fast, ATS-friendly resume customization with JD-driven language switching and OCR/text extraction support.

## Getting Started

Run the development server:

```bash
npm run dev
```

Open `http://localhost:3000` (or your chosen dev port) in the browser.

Edit the main page at `src/app/page.tsx`. Changes hot-reload automatically.

## Deploy

This project is optimized for Vercel:
- API routes use `runtime = "nodejs"`.
- Heavy routes set `maxDuration = 60` to reduce timeouts.

## Session Logs

- Recent: `docs/sessions/2025-10-15.md`

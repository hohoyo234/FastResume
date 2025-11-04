"use client";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <h1 className="text-2xl font-bold mb-4">FastResume 静态预览</h1>
      <p className="text-gray-700 mb-2">
        当前为 GitHub Pages 静态版本，仅用于“能打开页面”。
      </p>
      <p className="text-gray-600 mb-6">
        服务器端功能（如 /api/ocr、解析等）暂未启用，后续将迁移。
      </p>
      <div className="flex gap-4">
        <Link href="/debug" className="px-4 py-2 rounded bg-blue-600 text-white">
          进入 Debug 示例页
        </Link>
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2 rounded bg-gray-700 text-white"
        >
          项目仓库
        </a>
      </div>
    </main>
  );
}

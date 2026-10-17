import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "反诈知识库",
  description: "RAG反诈问答系统",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}

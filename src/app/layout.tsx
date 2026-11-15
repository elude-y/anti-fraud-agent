import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import AssistantPet from "@/components/assistant-pet/assistant-pet";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SafeAgent - AI 智能反诈研判平台",
    template: "%s · SafeAgent",
  },
  description: "基于真实案例检索、智能研判与动态沙箱验证的可疑链接和短信分析平台。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <AssistantPet />
      </body>
    </html>
  );
}

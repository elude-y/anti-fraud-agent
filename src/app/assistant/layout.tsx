import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI 助手",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

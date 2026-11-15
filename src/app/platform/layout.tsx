import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI 平台",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

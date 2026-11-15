import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "历史与洞察",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

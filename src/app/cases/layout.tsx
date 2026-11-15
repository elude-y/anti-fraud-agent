import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "反诈知识库",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

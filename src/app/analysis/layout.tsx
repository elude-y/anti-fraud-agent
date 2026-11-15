import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "智能研判",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

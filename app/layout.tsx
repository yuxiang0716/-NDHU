import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "程式接案社｜CODE × WORK", description: "Coding × Freelance × Community" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}

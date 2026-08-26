import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://posid-ai30-ci.kimhyunjung1.chatgpt.site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Posid AI담당관3.0",
  description: "AI 소식부터 우리가 만든 서비스까지, 업무에 바로 쓰는 AI 이야기",
  openGraph: { title: "Posid AI담당관3.0", description: "AI 소식부터 우리가 만든 서비스까지", type: "website", url: siteUrl, images: [{ url: "/og.png", width: 1200, height: 630, alt: "Posid AI담당관3.0" }] },
  twitter: { card: "summary_large_image", title: "Posid AI담당관3.0", description: "AI 소식부터 우리가 만든 서비스까지", images: ["/og.png"] },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

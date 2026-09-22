import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Executive Production Report",
  description: "ติดตามยอดผลิต Actual เทียบ Target สำหรับผู้บริหาร"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}

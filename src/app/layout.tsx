import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrinitySzg",
  description: "기술, 고객, 사업 관점의 AI가 토론하고 실행 가능한 결론을 도출하는 의사결정 서비스"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

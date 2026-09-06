import type { Metadata } from "next";
import ShortList from "../short-list";

export const metadata: Metadata = { title: "짧게보기 | Posid AI담당관3.0", description: "AI 팁, 발견, 활용 아이디어와 참고 링크를 짧게 읽어보세요." };

export default function ShortsPage() { return <ShortList />; }

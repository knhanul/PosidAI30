import type { Metadata } from "next";
import AdminDashboard from "./admin-dashboard";

export const metadata: Metadata = { title: "콘텐츠 관리 | Posid AI담당관3.0", robots: { index: false, follow: false } };

export default function AdminPage() { return <AdminDashboard />; }

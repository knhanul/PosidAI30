type IconName = "arrow" | "book" | "bolt" | "bookmark" | "cube" | "news" | "search";

export default function SiteIcon({ name, size = 22 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "arrow") return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
  if (name === "book") return <svg {...common}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" /></svg>;
  if (name === "bolt") return <svg {...common}><path d="m13 2-9 12h7l-1 8 9-12h-7z" /></svg>;
  if (name === "bookmark") return <svg {...common}><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" /></svg>;
  if (name === "cube") return <svg {...common}><path d="m12 2 8 4.5v9L12 20l-8-4.5v-9z" /><path d="m4.5 6.7 7.5 4.2 7.5-4.2M12 11v9" /></svg>;
  if (name === "news") return <svg {...common}><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
  return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}

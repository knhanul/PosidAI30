import { notFound } from "next/navigation";
import { categories, getCategory, posts } from "../../content";
import CategoryList from "../../category-list";
import TogetherProjectList from "../../together-ai/project-list";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() { return Object.keys(categories).map((slug) => ({ slug })); }

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();
  if (slug === "together") return <TogetherProjectList />;
  const categoryPosts = posts.filter((post) => post.category === slug);
  return <CategoryList slug={slug as keyof typeof categories} fallback={categoryPosts} />;
}

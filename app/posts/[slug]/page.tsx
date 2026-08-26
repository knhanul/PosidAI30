import type { Metadata } from "next";
import { getPost } from "../../content";
import PostDetail from "../../post-detail";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: `${post.title} | Posid AI담당관3.0`, description: post.summary,
    openGraph: { title: post.title, description: post.summary, images: [] },
    twitter: { card: "summary", title: post.title, description: post.summary, images: [] },
  };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  return <PostDetail slug={slug} fallback={getPost(slug)} />;
}

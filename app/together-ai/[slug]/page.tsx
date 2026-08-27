import TogetherProjectDetail from "../project-detail";

type Props = { params: Promise<{ slug: string }> };
export default async function TogetherAiProjectPage({ params }: Props) {
  const { slug } = await params;
  return <TogetherProjectDetail slug={slug} />;
}

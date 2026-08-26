export type CategorySlug = "news" | "learn" | "use" | "together";

export type ContentBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "steps"; items: string[] }
  | { type: "callout"; title: string; text: string };

export type Post = {
  id?: string;
  slug: string;
  category: CategorySlug;
  title: string;
  summary: string;
  topic: string[];
  keyPoints?: string[];
  date: string;
  readTime: string;
  author: string;
  featured?: boolean;
  new?: boolean;
  showOnHome?: boolean;
  ownedByCurrentUser?: boolean;
  status?: "draft" | "published";
  thumbnailUrl?: string | null;
  bodyMarkdown?: string;
  contentFormat?: "markdown" | "html";
  bodyHtml?: string;
  attachments?: Array<{ id: string; filename: string; size: number; downloadUrl: string }>;
  service?: {
    status: "사용 가능" | "준비 중";
    audience: string;
    actionLabel: string;
    actionHref: string;
  };
  body: ContentBlock[];
};

export const categories: Record<CategorySlug, { label: string; eyebrow: string; description: string; tone: string }> = {
  news: { label: "AI 소식", eyebrow: "변화를 쉽게", description: "업무와 연결되는 AI 흐름만 골라 짧고 쉽게 전합니다.", tone: "orange" },
  learn: { label: "배워보기", eyebrow: "기초부터 차근차근", description: "부담 없이 읽고 바로 따라 하는 짧은 AI 안내서입니다.", tone: "yellow" },
  use: { label: "써보기", eyebrow: "오늘 업무에 바로", description: "프롬프트와 실제 활용 순서를 업무 장면별로 정리합니다.", tone: "red" },
  together: { label: "함께 만든 AI", eyebrow: "우리의 아이디어를 서비스로", description: "TF와 구성원이 만든 AI 서비스를 소개하고 함께 개선합니다.", tone: "charcoal" },
};

export const posts: Post[] = [
  {
    slug: "meeting-note-in-one-minute", category: "use", title: "회의 메모를 1분 만에 정리하는 프롬프트",
    summary: "두서없는 메모를 결정사항·담당자·기한이 보이는 회의 결과로 바꾸는 가장 간단한 방법을 소개합니다.",
    topic: ["회의", "업무자동화", "프롬프트"], date: "2026.08.25", readTime: "4분", author: "AI TF", featured: true, new: true,
    body: [
      { type: "paragraph", text: "회의가 끝난 뒤 메모를 다시 읽고 정리하는 데 시간이 오래 걸린다면, 입력 형식과 결과 형식을 먼저 정해 AI에게 전달해 보세요. 핵심은 메모를 예쁘게 요약하는 것이 아니라 다음 행동이 보이도록 만드는 것입니다." },
      { type: "heading", text: "먼저 메모를 그대로 붙여 넣으세요" },
      { type: "paragraph", text: "맞춤법이나 순서를 먼저 정리할 필요는 없습니다. 참석자, 논의 내용, 숫자와 날짜를 원문 그대로 입력하면 AI가 빠뜨릴 가능성을 줄일 수 있습니다. 개인정보나 민감정보는 내부 기준에 따라 제외해야 합니다." },
      { type: "callout", title: "바로 쓰는 요청문", text: "아래 회의 메모를 ①핵심 논의 ②결정사항 ③담당자와 기한 ④추가 확인사항으로 나누어 정리해 주세요. 원문에 없는 내용은 추측하지 말고 ‘확인 필요’라고 표시해 주세요." },
      { type: "steps", items: ["AI가 만든 결과를 원문과 대조합니다.", "담당자·날짜·금액처럼 중요한 정보를 다시 확인합니다.", "확정되지 않은 내용은 ‘협의 중’ 또는 ‘확인 필요’로 남깁니다."] },
    ],
  },
  {
    slug: "ai-change-briefing", category: "news", title: "생성형 AI 도구, 최근 무엇이 달라지고 있나요?",
    summary: "기능 이름보다 중요한 문서 이해·검색·협업 방식의 변화를 업무 관점에서 살펴봅니다.",
    topic: ["AI동향", "업무변화"], date: "2026.08.24", readTime: "5분", author: "AI TF", new: true,
    body: [
      { type: "paragraph", text: "새로운 AI 기능은 빠르게 등장하지만 모든 기능을 따라갈 필요는 없습니다. 우리 업무에서 실제로 달라지는 지점을 문서 이해, 정보 확인, 협업의 세 가지 관점으로 나누어 살펴보는 편이 효율적입니다." },
      { type: "heading", text: "기능보다 업무 장면을 먼저 봅니다" },
      { type: "steps", items: ["긴 자료에서 필요한 근거를 찾는 시간이 줄어드는가", "반복 문서의 초안을 일정한 형식으로 만들 수 있는가", "사람이 반드시 확인해야 할 지점이 분명한가"] },
      { type: "callout", title: "확인 원칙", text: "AI 관련 기능과 정책은 자주 바뀝니다. 실제 업무 적용 전에는 해당 도구의 공식 안내와 기관 내부 보안 기준을 함께 확인하세요." },
    ],
  },
  {
    slug: "safe-ai-question", category: "learn", title: "처음 시작하는 안전한 AI 질문법",
    summary: "무엇을 넣지 말아야 하는지부터 원하는 답변을 얻는 질문 순서까지 한 번에 익혀봅니다.",
    topic: ["AI기초", "안전한활용"], date: "2026.08.22", readTime: "6분", author: "AI TF",
    body: [
      { type: "paragraph", text: "좋은 질문은 길고 복잡한 질문이 아니라 목적과 범위가 분명한 질문입니다. 먼저 입력해도 되는 정보인지 확인하고, AI에게 역할·할 일·결과 형식을 차례로 알려 주세요." },
      { type: "steps", items: ["개인정보·고객정보·비공개 업무자료가 포함됐는지 확인합니다.", "‘누구를 위한 무엇’인지 한 문장으로 목적을 적습니다.", "표, 목록, 세 문장 요약처럼 원하는 결과 형식을 정합니다.", "사실과 추측을 구분하고 근거가 없으면 표시하도록 요청합니다."] },
    ],
  },
  {
    slug: "document-key-points", category: "use", title: "긴 문서에서 핵심 근거만 빠르게 찾는 방법",
    summary: "요약만 요청하지 않고 쪽수·문단·근거 문장을 함께 찾도록 요청하는 실무 활용법입니다.",
    topic: ["문서검토", "요약"], date: "2026.08.20", readTime: "5분", author: "AI TF",
    body: [
      { type: "paragraph", text: "긴 문서를 단순히 요약하면 중요한 예외조건이 사라질 수 있습니다. 먼저 확인하려는 질문을 정한 다음, 답변과 함께 근거 위치를 제시하도록 요청해야 검토 시간을 줄일 수 있습니다." },
      { type: "callout", title: "요청 예시", text: "이 문서에서 계약 종료 조건과 예외사항을 찾아 표로 정리해 주세요. 각 항목에 근거 문단을 함께 적고, 문서에 없는 내용은 추가하지 마세요." },
    ],
  },
  {
    slug: "answer-check-three-steps", category: "learn", title: "AI 답변을 검증하는 세 단계",
    summary: "숫자·날짜·제도처럼 중요한 정보는 어떻게 다시 확인해야 하는지 짧게 정리했습니다.",
    topic: ["검증", "AI기초"], date: "2026.08.18", readTime: "4분", author: "AI TF",
    body: [
      { type: "steps", items: ["답변에서 사실로 제시된 숫자·날짜·고유명사를 표시합니다.", "공식 문서나 원문에서 같은 정보를 확인합니다.", "확인되지 않은 문장은 삭제하거나 ‘확실하지 않음’으로 표시합니다."] },
      { type: "paragraph", text: "자연스럽게 읽히는 답변이 정확한 답변을 의미하지는 않습니다. 최종 판단과 외부 공유의 책임은 사용자에게 있으므로 중요한 업무일수록 근거를 남겨야 합니다." },
    ],
  },
  {
    slug: "meeting-assistant-service", category: "together", title: "회의록 정리 도우미",
    summary: "회의 메모를 넣으면 결정사항과 후속업무 중심으로 정리해 주는 구성원용 실험 서비스입니다.",
    topic: ["내부서비스", "회의"], date: "2026.08.15", readTime: "3분", author: "AI TF",
    service: { status: "준비 중", audience: "회의 결과를 자주 정리하는 구성원", actionLabel: "서비스 안내 보기", actionHref: "#service-guide" },
    body: [
      { type: "paragraph", text: "회의록 정리 도우미는 회의 메모를 결정사항, 담당자, 기한, 추가 확인사항으로 구분해 주는 내부 실험 서비스입니다. 현재 화면의 서비스명과 상태는 구성 예시이며 실제 배포 전에 운영 정보를 연결해야 합니다." },
      { type: "heading", text: "이런 분께 유용합니다" },
      { type: "steps", items: ["회의가 끝날 때마다 결과를 다시 구조화하는 분", "담당자와 기한을 빠뜨리지 않고 공유하려는 분", "반복되는 회의록 형식을 일정하게 유지하려는 팀"] },
      { type: "callout", title: "의견을 기다립니다", text: "사용 중 불편한 점과 추가되면 좋은 기능을 알려주시면 다음 개선에 반영합니다." },
    ],
  },
  {
    slug: "prompt-library-service", category: "together", title: "업무 프롬프트 보관함",
    summary: "팀에서 검증한 프롬프트를 업무별로 찾아보고 함께 다듬는 공유 서비스입니다.",
    topic: ["내부서비스", "프롬프트"], date: "2026.08.12", readTime: "3분", author: "AI TF",
    service: { status: "준비 중", audience: "자주 쓰는 요청문을 팀과 공유하고 싶은 구성원", actionLabel: "서비스 안내 보기", actionHref: "#service-guide" },
    body: [{ type: "paragraph", text: "업무 프롬프트 보관함은 개인이 갖고 있던 유용한 요청문을 업무 주제별로 모으고, 사용 후기를 바탕으로 더 나은 형태로 개선하는 서비스입니다." }],
  },
];

export function getPost(slug: string) { return posts.find((post) => post.slug === slug); }
export function getCategory(slug: string) { return categories[slug as CategorySlug]; }

INSERT INTO posts (id, slug, category, short_category, external_url, title, summary, body_markdown, content_format, content_density, topics, key_points, status, is_featured, show_on_home, thumbnail_type, author_id, published_at, created_at, updated_at)
VALUES
('a1000000-0000-4000-8000-000000000001', 'short-tip-prompt-template', 'short', 'tip', NULL, '프롬프트 템플릿을 재사용하면 시간이 절약된다', '같은 작업을 반복한다면 프롬프트를 템플릿으로 저장해 두면 매번 다시 작성할 필요가 없다. 변수 부분만 바꿔서 입력하면 된다.', '같은 작업을 반복한다면 프롬프트를 템플릿으로 저장해 두면 매번 다시 작성할 필요가 없다.
변수 부분만 바꿔서 입력하면 된다.

예: "[주제]에 대해 [대상]에게 설명하는 [형식]으로 작성해줘"', 'markdown', 'compact', '["AI/프롬프트","팁"]'::jsonb, '[]'::jsonb, 'published', false, true, 'preset', 1, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour'),

('a1000000-0000-4000-8000-000000000002', 'short-discovery-new-model', 'short', 'discovery', 'https://openai.com', '새로운 AI 모델이 발표되었다', '최근 발표된 모델은 문서 이해 능력이 크게 향상되었다고 한다. 실제 업무에 적용하기 전에 공식 문서를 확인해 보자.', '최근 발표된 모델은 문서 이해 능력이 크게 향상되었다고 한다.
실제 업무에 적용하기 전에 공식 문서를 확인해 보자.', 'markdown', 'compact', '["AI/모델","발견"]'::jsonb, '[]'::jsonb, 'published', false, true, 'preset', 1, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours'),

('a1000000-0000-4000-8000-000000000003', 'short-use-meeting-summary', 'short', 'use_case', NULL, '회의록을 AI로 정리하는 실제 활용 사례', '매주 회의가 끝난 후 30분씩 정리에 시간을 쓰던 팀에서 AI를 활용해 5분 만에 회의록을 완성하게 된 사례를 소개한다.', '매주 회의가 끝난 후 30분씩 정리에 시간을 쓰던 팀에서 AI를 활용해 5분 만에 회의록을 완성하게 된 사례를 소개한다.

핵심은 입력 형식을 고정하고, 결정사항과 담당자를 구분해 출력하도록 요청하는 것이다.', 'markdown', 'compact', '["AI/활용","회의"]'::jsonb, '[]'::jsonb, 'published', false, true, 'preset', 1, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 hours'),

('a1000000-0000-4000-8000-000000000004', 'short-memo-quick-note', 'short', 'memo', NULL, '메모', 'AI가 항상 정확한 답을 주지는 않는다. 중요한 숫자는 반드시 직접 확인하자.', 'AI가 항상 정확한 답을 주지는 않는다.
중요한 숫자는 반드시 직접 확인하자.', 'markdown', 'compact', '[]'::jsonb, '[]'::jsonb, 'published', false, true, 'preset', 1, NOW() - INTERVAL '4 hours', NOW() - INTERVAL '4 hours', NOW() - INTERVAL '4 hours'),

('a1000000-0000-4000-8000-000000000005', 'short-link-prompt-guide', 'short', 'link', 'https://platform.openai.com/docs/guides/prompt-engineering', '좋은 프롬프트 작성 가이드 링크', 'OpenAI에서 공식으로 제공하는 프롬프트 엔지니어링 가이드다. 6가지 전략을 중심으로 실용적인 팁을 정리해 두었다.', 'OpenAI에서 공식으로 제공하는 프롬프트 엔지니어링 가이드다.
6가지 전략을 중심으로 실용적인 팁을 정리해 두 있다.

초보자도 쉽게 따라할 수 있어 추천한다.', 'markdown', 'compact', '["AI/프롬프트","링크"]'::jsonb, '[]'::jsonb, 'published', false, true, 'preset', 1, NOW() - INTERVAL '5 hours', NOW() - INTERVAL '5 hours', NOW() - INTERVAL '5 hours'),

('a1000000-0000-4000-8000-000000000006', 'short-tip-short-title', 'short', 'tip', NULL, '단축키', 'Ctrl+K로 빠르게 검색할 수 있다.', 'Ctrl+K로 빠르게 검색할 수 있다.', 'markdown', 'compact', '["팁"]'::jsonb, '[]'::jsonb, 'published', false, false, 'preset', 1, NOW() - INTERVAL '6 hours', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '6 hours'),

('a1000000-0000-4000-8000-000000000007', 'short-discovery-long-title', 'short', 'discovery', NULL, 'AI가 코드를 작성해 줄 때 가장 주의해야 할 점은 보안 라이브러리의 최신 권장사항을 따르지 않을 수 있다는 것이다', 'AI가 생성한 코드는 보안 라이브러리의 최신 권장사항을 반영하지 않을 수 있다. 특히 인증, 암호화, 입력 검증 부분은 반드시 수동으로 검토해야 한다.', 'AI가 생성한 코드는 보안 라이브러리의 최신 권장사항을 반영하지 않을 수 있다.
특히 인증, 암호화, 입력 검증 부분은 반드시 수동으로 검토해야 한다.

이것은 매우 긴 본문을 테스트하기 위한 예시입니다. 짧게보기의 본문은 최대 2,000자까지 입력할 수 있으며, 이 한계를 초과하면 Backend에서 HTTP 400 에러를 반환합니다. 프론트엔드에서도 2,000자 counter를 통해 사용자에게 남은 글자 수를 안내합니다. 긴 본문도 줄바꿈이 자연스럽게 표시되어야 하며, 모바일 화면에서도 읽기 편해야 합니다. 이 테스트 데이터는 다양한 viewport에서 레이아웃이 깨지지 않는지 확인하는 데 사용됩니다.', 'markdown', 'compact', '["AI/보안","발견","코드"]'::jsonb, '[]'::jsonb, 'published', false, true, 'preset', 1, NOW() - INTERVAL '7 hours', NOW() - INTERVAL '7 hours', NOW() - INTERVAL '7 hours'),

('a1000000-0000-4000-8000-000000000008', 'short-use-no-tags', 'short', 'use_case', NULL, '태그 없는 활용 사례', '이 짧게보기는 해시태그가 없는 경우를 테스트하기 위한 데이터다.', '이 짧게보기는 해시태그가 없는 경우를 테스트하기 위한 데이터다.
필터와 검색이 정상 동작하는지 확인한다.', 'markdown', 'compact', '[]'::jsonb, '[]'::jsonb, 'published', false, true, 'preset', 1, NOW() - INTERVAL '8 hours', NOW() - INTERVAL '8 hours', NOW() - INTERVAL '8 hours'),

('a1000000-0000-4000-8000-000000000009', 'short-memo-multi-line', 'short', 'memo', NULL, '여러 줄 메모 테스트', '첫 번째 줄입니다.
두 번째 줄입니다.
세 번째 줄입니다.
네 번째 줄입니다.
다섯 번째 줄입니다.', '첫 번째 줄입니다.
두 번째 줄입니다.
세 번째 줄입니다.
네 번째 줄입니다.
다섯 번째 줄입니다.

이렇게 여러 줄로 작성된 메모도 줄바꿈이 자연스럽게 표시되어야 합니다.', 'markdown', 'compact', '["메모","테스트"]'::jsonb, '[]'::jsonb, 'published', false, true, 'preset', 1, NOW() - INTERVAL '9 hours', NOW() - INTERVAL '9 hours', NOW() - INTERVAL '9 hours'),

('a1000000-0000-4000-8000-000000000010', 'short-link-no-url', 'short', 'link', NULL, '외부 링크 없는 링크 분류', '링크 분류지만 외부 URL이 없는 경우도 표시가 자연스러워야 한다.', '링크 분류지만 외부 URL이 없는 경우도 표시가 자연스러워야 한다.
원문 보기 버튼이 나오지 않아야 한다.', 'markdown', 'compact', '["링크"]'::jsonb, '[]'::jsonb, 'published', false, true, 'preset', 1, NOW() - INTERVAL '10 hours', NOW() - INTERVAL '10 hours', NOW() - INTERVAL '10 hours')
ON CONFLICT (slug) DO NOTHING;

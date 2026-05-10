# ANTIEGG · Ghost → WP 자동화 시스템 개요

> Ghost CMS(square.antiegg.kr)에 발행된 아티클을 WordPress(antiegg.kr)로 자동 이전하고, 같은 콘텐츠를 네이버 블로그·브런치에도 재발행하는 통합 자동화 시스템.
>
> **레포**: https://github.com/leejaeeun123/ghost-to-wp
> **운영**: 로컬 서버 pm2 (`ghost-to-wp`, `localhost:3000`) + GitHub Actions cron
> **최종 업데이트**: 2026-05-10

---

## 1. 한눈에 보는 흐름

```
Ghost 아티클 발행
       │
       ├─[금요일 11:00 KST cron]─→ Notion 매칭 → WP draft/예약 발행
       │                                              │
       │                                              ├─→ 댓글로 WP 링크 자동 작성
       │                                              │
       │                            [월·화 19:00] ───→ 브런치 자동 예약 발행
       │
       └─[운영자 수동 트리거]──────→ 네이버 블로그 (API 승인 대기 / Playwright PoC)
```

---

## 2. 핵심 기능

| 영역 | 설명 | 트리거 |
|---|---|---|
| **자동 동기화** | 매주 금요일 09:00 UTC(11:00 KST 부근). Notion 발행일 기준 해당 주 아티클을 WP에 future 상태로 예약 | GitHub Actions + 서버 cron 이중 |
| **HTML 변환** | Ghost HTML → WP Gutenberg 블록 (재사용 블록 ID 사용) | 동기화 시 자동 |
| **이미지 처리** | Ghost 이미지 → WP 미디어 라이브러리. webp는 jpg로 변환. 그레이 아티클 대표이미지는 흑백 변환 | 동기화 시 자동 |
| **카테고리/태그** | Notion 🔴 콘텐츠 종류 + 🔴 카테고리 + 테마/키워드/기타 매핑 | 동기화 시 자동 |
| **SEO 메타** | Yoast 필드(키프레이즈, 메타 설명, 소셜 메타) 자동 설정 | 동기화 시 자동 |
| **Notion 댓글** | 동기화 완료 후 해당 Notion 페이지에 WP 발행 링크 코멘트 자동 추가 | 동기화 후 |
| **브런치 재발행** | WP 아티클 → 브런치 cURL 세션 기반 자동 예약 발행 | 매일 08:00 cron |
| **네이버 재발행** | OAuth 연동 완료 / writePost API 승인 대기 / Playwright PoC 검토 중 | 수동 |

---

## 3. WP 블록 변환 규칙

### 재사용 블록 ID (WP DB 고정값 — 절대 변경 금지)

| 블록 | WP ID |
|---|---|
| 구분선 | `5701` |
| 40px 스페이서 | `19650` |
| 70px 스페이서 (연속 H3 위) | `27530` |
| 20px 스페이서 | `19912` |
| 10px 스페이서 | `19767` |
| 에디터 카드 꼬리 | `19773` |

### 본문 변환

| Ghost 요소 | WP 변환 | 부가 규칙 |
|---|---|---|
| `<h2>` | wp:heading 가운데 정렬 | 위 구분선 + 100px 스페이서, 20자 초과 시 중간 공백에서 `<br>` 줄바꿈 |
| `<h3>` | wp:heading | 위·아래 40px 여백, 연속 H3 두 번째부터 위 70px |
| `<h4>` | wp:heading | 위·아래 40px 여백 |
| **단독 bold 문단** | **자동으로 H3 승격** | `<p><strong>전체</strong></p>` + 마침표 없음 + 60자 이내 |
| `<p>` | wp:paragraph | 본문 내 하이퍼링크 금지 → 유입링크로 분리 |
| 연속 이미지 2개 / 갤러리 | wp:columns (이미지 2개 컬럼 패턴) | 가로형 700px / 세로형 467px |
| 이미지 캡션 | `<sup>` 태그로 감쌈 | 출처 prefix 자동 정규화 |
| YouTube iframe | wp:embed | "동영상 출처:" prefix 사용 |
| Ghost 갤러리 카드 | wp:columns 분할 | 갤러리 figcaption은 모든 이미지에 복제 |
| `<blockquote>` | wp:quote | 색상 #9d9d9d, 이탤릭, 큰따옴표 |
| `<hr>` | 구분선 + 40px | hr 다음 H2가 없으면 100px 스페이서 (결문) |
| Ghost bookmark / button | 유입링크 시퀀스 | WEBSITE/INSTAGRAM/행동 유도 자동 분류 |
| `<ul>/<ol>` | wp:list | 색상 #9d9d9d (참고문헌·부가설명 스타일, 폰트 크기는 WP 기본 유지) |
| 참고문헌 섹션 | 결문 뒤 wp:list로 흡수 | 원문 `[참고문헌]` 라벨 자동 인식 |

### 헤딩 위계 정규화

- Ghost가 H1~H6 어떤 깊이로 쓰든 WP에서는 H2~H4만 허용.
- 사용된 level을 수집해 가장 높은 것을 H2, 다음을 H3, 그 다음을 H4로 자동 강등.
- `<hr>` 직후 첫 heading은 항상 H2로 승격 (섹션 시작 보장).

### 단독 bold → H3 자동 승격 (의도된 부제목 흡수)

`<p><strong>...</strong></p>` 패턴을 사용한 부제목 마크업을 자동 변환. 모든 조건 충족 시:

1. `<p>` 내용이 단 하나의 `<strong>` (앞뒤 텍스트 없음 → 문단 중간 강조 제외)
2. 텍스트가 마침표·물음표·느낌표·말줄임표로 끝나지 않음 (완성 문장 강조 제외)
3. 60자 이내 (헤딩 길이 휴리스틱)

예: `<p><strong>제4의 벽이 세워지다</strong></p>` → `<h3>` 변환

### 캡션 출처 표기

| 케이스 | 처리 |
|---|---|
| 이미지 캡션 "출처: ~" | "이미지 출처 : ~" |
| 동영상 캡션 "출처: ~" | "동영상 출처 : ~" |
| 캡션에 이미 "이미지/동영상 출처" 표기 있음 | 그대로 (중복 prefix X) |
| 캡션 내 하이퍼링크 | strip (텍스트만 유지) |

### 유입링크 워딩 규칙

| 원본 | 변환 |
|---|---|
| Instagram URL | `INSTAGRAM : @username` (URL에서 추출) |
| 행동 유도 텍스트 (~가기, ~보기) | 원본 유지 |
| 일반 사이트 + 북마크 타이틀 | `WEBSITE : 브랜드명` |
| 끝에 "웹사이트/홈페이지/사이트" 접미사 | 자동 제거 (예: "타이거모닝 웹사이트" → "타이거모닝") |
| 이미 "WEBSITE :" prefix 있음 | 중복 추가 X |

### 유입링크 고정 시퀀스

```
40px(19650) → 구분선(5701) → 20px(19912) → <p 15px center>링크</p> → 10px(19767) → 구분선(5701)
```

여러 링크가 연속되면 단일 `<p>` 안에 `<br>`로 병렬. 정렬: website(0) → instagram(1) → action(2).

### 아티클 종결 시퀀스

```
40px(19650) → 구분선(5701) → 20px(19912) → 에디터 카드 shortcode → 20px(19912) → 에디터 카드 꼬리(19773)
```

참고문헌이 있으면 결문 뒤 wp:list 추가, 없으면 결문 뒤 100px 스페이서.

---

## 4. Notion DB 연동

### 매칭 키
**Square CMS** URL 필드에 Ghost 슬러그 포함 여부로 매칭 (`url.contains` 필터, substring 오탐 방지를 위해 정확 매칭 우선).

### 필드 사용

| Notion 필드 | 타입 | 용도 |
|---|---|---|
| 아티클 제목 | title | 제목 표시용 |
| 부제목 | rich_text | Yoast 메타 설명 폴백 |
| 바이럴 멘트 | rich_text | Yoast 메타 설명 (이모지 자동 제거, 140자 컷) |
| 발행일 | date | WP 발행일 (시간 없으면 KST 07:50 부여) |
| 상태 | select | 진행 상태 (참고) |
| Square CMS | url | Ghost 슬러그 매칭 키 |
| **🔴 콘텐츠 종류** | select / multi_select | **그레이 판별 단일 진실 원천** (GRAY/그레이/CURATION/큐레이션) |
| 🔴 카테고리 | multi_select | 큐레이션 서브카테고리 (아트/컬쳐/디자인 등) — 그레이일 때는 무시 |
| 🔴 키워드 | multi_select | WP 태그 |
| 🔴 테마 | multi_select | WP 태그 |
| 기타 | multi_select | WP 태그 (큐레이션/그레이 발행 시 ANTIEGG 태그는 자동 제외) |

### 카테고리 매핑

| 콘텐츠 종류 | WP 카테고리 |
|---|---|
| GRAY/그레이 | **매거진(25) + 그레이(78)** 만 (🔴 카테고리 무시, 대표이미지 흑백 변환) |
| CURATION/큐레이션 | 매거진(25) + 큐레이션(77) + 🔴 카테고리 매핑 |
| Notion 미연동 | Ghost 태그 폴백 |

### 큐레이션 서브카테고리 (🔴 카테고리 → WP 카테고리 ID)

| Notion | WP ID |
|---|---|
| 아트 | 112 |
| 컬쳐 | 122 |
| 디자인 | 113 |
| 라이프스타일 | 125 |
| 미디어 | 120 |
| 피플 | 3253 |
| 플레이스 | 3252 |
| 브랜드 | 3251 |

---

## 5. 에디터 매칭

| 원칙 | 동작 |
|---|---|
| 단일 진실 원천 | WP 등록 에디터 이름 (sync 과정에서 자동 변경 금지) |
| 매칭 1순위 | Ghost 작성자 이름 ↔ WP user.name **완전 일치** (대소문자/공백 무시) |
| 매칭 2순위 | 동명이인일 때만 슬러그로 disambiguate |
| 매칭 실패 시 | `skipped_no_author` (WP에서 직접 등록 후 재동기화 필요) |
| 에디터 카드 템플릿 | `wpUserId → templateId` 직접 매핑 (`editor-card.ts` `EDITOR_TEMPLATE_MAP`) |

신규 에디터 등록 시 WP 표시 이름을 Ghost와 일치시키고 `EDITOR_TEMPLATE_MAP`에 wpUserId → templateId 한 줄만 추가.

---

## 6. 이미지 처리

| 케이스 | 처리 |
|---|---|
| Ghost 이미지 (`square.antiegg.kr/content/images/...`) | WP 미디어 라이브러리에 업로드 후 URL 교체 |
| webp 확장자 | sharp로 jpg 변환 후 업로드 (품질 90) |
| 그레이 아티클 대표이미지 | sharp grayscale 변환 후 jpg로 업로드 |
| 가로형/정방형 | width 700px |
| 세로형 | width 467px |
| 캡션 내 하이퍼링크 | strip |

---

## 7. SEO/소셜 메타 (Yoast)

| 필드 | 값 |
|---|---|
| 초점 키프레이즈 | 제목에 포함된 Notion 키워드/테마/Ghost 태그 중 첫 매칭, 없으면 첫 항목 |
| 슬러그 | 제목 영어 번역 (Google Translate API, 없으면 Ghost 슬러그) |
| 메타 설명 | `부제목 \| 바이럴멘트` (이모지 제거, 140자 컷, 마지막 완성 문장에서 자름) |
| 소셜 제목 | `%%title%% %%sep%% %%sitename%% %%primary_category%%` |
| 소셜 설명 | 메타 설명과 동일 |
| 소셜 이미지 | 대표이미지와 동일 (그레이는 흑백 처리된 이미지) |

---

## 8. 운영 명령어

```bash
# 로컬 서버 (pm2 관리)
pm2 restart ghost-to-wp     # 코드 변경 후 재시작
pm2 logs ghost-to-wp        # 로그 확인
pm2 list                    # 상태 확인

# 수동 동기화 (CLI)
npx tsx src/index.ts --slug "<슬러그>" --dry-run    # 미리보기
npx tsx src/index.ts --slug "<슬러그>"              # draft 생성
npx tsx src/index.ts --slug "<슬러그>" --publish    # 즉시 발행

# 수동 트리거 (HTTP API)
POST http://localhost:3000/api/sync/single  { "slug": "...", "status": "future", "date": "..." }
POST http://localhost:3000/api/blog/brunch/auto-reserve   # 브런치 즉시 예약 실행
```

---

## 9. 2026-05-10 개선 내역

| 커밋 | 내용 |
|---|---|
| `8894ba3` | 단독 bold 문단 → H3 자동 승격 (where-the-audience-stands 같은 다중 부제목 패턴 흡수) |
| `70ed372` | 그레이 판별을 Notion `🔴 콘텐츠 종류` 단일 진실 원천으로 전환 (대표이미지 흑백 변환 누락 버그 해결) |
| `2f36375` | WP 발행 포맷 9가지 보정 + 에디터 매칭 풀네임 우선 |

### 9가지 포맷 보정 상세

1. H3/H4 위·아래 40px 여백
2. 여백 중복 자동 dedup (이미지 + 유입링크 사이 등)
3. WEBSITE 라벨 브랜드명 정규화 ("웹사이트" 접미사 제거 + prefix 중복 방지)
4. 목록 폰트 사이즈 제거, 색상 #9d9d9d만 유지
5. 큐레이션/그레이 발행 시 ANTIEGG 태그 제외
6. 동영상은 "동영상 출처:" / 이미지는 "이미지 출처:" 분기
7. 캡션 내 기존 출처 표기 보존 시 prefix 중복 추가 X
8. 헤딩·리스트 내 하이퍼링크 strip (캡션은 기존부터 처리됨)
9. webp 이미지는 jpg로 변환 후 WP 업로드

---

## 10. 진행 중 / 미해결

| 항목 | 상태 |
|---|---|
| 네이버 블로그 writePost API | 2026-04-25 검수 최종 반려 (신규 승인 정책상 차단) |
| 네이버 Playwright 자동화 PoC | multi-paragraph paste 시 SE3 정렬 매핑 손실 — 다음 세션에서 SmartEditor API 우회 시도 |
| 브런치 세션 갱신 | cURL은 주기적 만료 — 금요일 sync 후 월요일 전 갱신 필요 |
| 단발성 단독 bold 문단 오변환 | 마침표 없는 짧은 강조 단독 bold가 H3로 승격될 수 있음 (현재까지 ANTIEGG 글에서 발견 X) |

---

## 11. 환경변수 (`.env`)

| 변수 | 필수 | 용도 |
|---|---|---|
| `GHOST_API_URL` / `GHOST_ADMIN_API_KEY` | O | Ghost 포스트 조회 |
| `WP_API_URL` / `WP_USERNAME` / `WP_APP_PASSWORD` | O | WP REST API |
| `NOTION_API_KEY` / `NOTION_ARTICLE_DB_ID` | X | Notion 매칭 (없으면 Ghost 폴백) |
| `GOOGLE_TRANSLATE_API_KEY` | X | 슬러그 영어 번역 (없으면 Ghost 슬러그 사용) |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | X | 네이버 OAuth |

---

## 12. 파일 구조

```
src/
├── index.ts                    ← CLI 진입점
├── server.ts                   ← Express 서버 진입점 (pm2)
├── ghost-client.ts             ← Ghost Admin API
├── wp-client.ts                ← WP REST API
├── html-transformer.ts         ← [핵심] Ghost HTML → WP Block HTML 변환
├── image-handler.ts            ← 이미지 다운로드 → WP 업로드 → URL 교체
├── author-filter.ts            ← Ghost ↔ WP 사용자 매칭 (풀네임 우선)
├── category-mapper.ts          ← Ghost/Notion 태그 → WP 카테고리 매핑
├── notion-client.ts            ← Notion 아티클 로드맵 DB 연동
├── editor-card.ts              ← wpUserId → 에디터 카드 템플릿 ID 매핑
├── slug-generator.ts           ← 영어 슬러그 생성
├── scheduled-sync.ts           ← 금요일 cron 자동 동기화
├── routes/
│   ├── sync-routes.ts          ← /api/sync/* — 동기화 HTTP API
│   ├── blog-routes.ts          ← /api/blog/* — 네이버/브런치 포맷 미리보기
│   ├── brunch-routes.ts        ← /api/blog/brunch/* — 브런치 발행/예약
│   ├── naver-routes.ts         ← /api/naver/* — 네이버 OAuth/발행
│   └── ...
└── blog-format/                ← 블로그/브런치 재발행 모듈
    ├── naver-formatter.ts      ← 네이버 SE3 호환 마크업
    ├── brunch-formatter.ts     ← 브런치 마크업
    └── ...
```

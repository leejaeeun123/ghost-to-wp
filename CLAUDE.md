# CLAUDE.md

## 프로젝트 개요

Ghost CMS(square.antiegg.kr)에 발행된 아티클을 WordPress(antiegg.kr)로 자동 이전하고, 같은 콘텐츠를 네이버 블로그·브런치에도 재발행하는 통합 자동화 시스템.
ANTIEGG 매거진 운영팀이 사용하며, WP에 등록된 에디터의 글만 선별 이전한다.

### 진입점
- **로컬 서버 (pm2)**: `pm2 restart ghost-to-wp`로 관리. UI + HTTP API + 매일/매주 cron 통합 (포트 3000)
- **CLI**: `npx tsx src/index.ts ...` — 단발성 동기화, dry-run 검수
- **GitHub Actions**: 매주 금요일 09:00 UTC 자동 실행 (서버 cron과 이중 안전망)

> 종합 문서: [`docs/automation-overview.md`](./docs/automation-overview.md) — 전체 흐름·기능·룰·운영 명령어 한눈 정리

## 빠른 시작

```bash
npm install
cp .env.example .env   # 인증 정보 입력
npm run sync:dry        # dry-run (실제 업로드 없음)
npm run sync            # 실제 동기화
```

## 기술 스택

- **Runtime**: Node.js v20+, TypeScript, tsx (빌드 없이 직접 실행)
- **Ghost API**: Admin API, JWT 인증 (jsonwebtoken)
- **WP API**: REST API v2, Basic Auth (Application Password)
- **외부 의존성**: dotenv, jsonwebtoken (최소)

## 인프라

- Ghost (Square): https://square.antiegg.kr
- WordPress (본사이트): https://antiegg.kr
- 서버 접근 정보는 `.env`와 별도 관리 (이 파일에 포함하지 않음)

## 파일 구조

```
src/
├── index.ts                ← CLI 진입점
├── server.ts               ← Express 서버 (pm2로 관리, 포트 3000)
├── scheduled-sync.ts       ← 금요일 11:00 KST cron 자동 동기화
├── ghost-client.ts         ← Ghost Admin API
├── wp-client.ts            ← WP REST API
├── html-transformer.ts     ← [핵심] Ghost HTML → WP Block HTML 변환
├── image-handler.ts        ← 이미지 다운로드 → WP 업로드, webp→jpg, 그레이 흑백
├── author-filter.ts        ← Ghost ↔ WP 사용자 매칭 (풀네임 우선)
├── category-mapper.ts      ← Ghost/Notion → WP 카테고리 매핑
├── notion-client.ts        ← Notion 아티클 로드맵 DB 연동
├── editor-card.ts          ← wpUserId → 에디터 카드 템플릿 ID
├── slug-generator.ts       ← 영어 슬러그 생성
├── types.ts                ← 타입 정의
├── routes/
│   ├── sync-routes.ts      ← /api/sync/* — 동기화 HTTP API (syncOnePost 핵심)
│   ├── blog-routes.ts      ← /api/blog/* — 네이버/브런치 포맷 미리보기
│   ├── brunch-routes.ts    ← /api/blog/brunch/* — 브런치 발행/예약
│   ├── naver-routes.ts     ← /api/naver/* — 네이버 OAuth/발행
│   └── ...
└── blog-format/            ← 블로그/브런치 재발행 모듈 (별도 파이프라인)
    ├── naver-formatter.ts
    ├── brunch-formatter.ts
    ├── brunch-publisher.ts
    └── ...
```

## 핵심 개념: WP 블록 변환

### 이 프로젝트에서 가장 중요한 파일은 `html-transformer.ts`

Ghost HTML은 일반 HTML이지만, ANTIEGG WordPress는 Gutenberg Block Editor 규격을 따른다.
모든 블록에 `<!-- wp:... -->` 코멘트가 필수이며, 스페이서/구분선은 **재사용 블록 ID**로 참조한다.

### 재사용 블록 ID (WP DB 고정값 — 절대 변경 금지)

| 블록 | WP ID | 용도 |
|------|-------|------|
| 구분선 | `5701` | 섹션 구분 |
| 40px 스페이서 | `19650` | 기본 여백 |
| 70px 스페이서 | `27530` | 연속 H3 두 번째 이후 위 여백 |
| 20px 스페이서 | `19912` | 유입링크 내 여백 |
| 10px 스페이서 | `19767` | 유입링크 내 여백 |
| 에디터 카드 꼬리 | `19773` | 아티클 종결 시퀀스 맨 끝 |

사용법: `<!-- wp:block {"ref":19650} /-->` (WP가 해당 ID의 재사용 블록을 렌더링)

### 블록 변환 규칙 요약

| Ghost 요소 | WP 변환 | 주의사항 |
|-----------|---------|---------|
| `<h2>` | `<!-- wp:heading -->` + 가운데 정렬 | 앞에 반드시 구분선+100px 스페이서, 볼드(strong) 제거 |
| `<h3>` | `<!-- wp:heading -->` (level 3) | 위·아래 40px 여백, 연속 H3 두 번째부터 위 70px(27530) |
| `<h4>` | `<!-- wp:heading -->` (level 4) | 위·아래 40px 여백 |
| **단독 bold 문단** | **자동으로 H3 승격** | `<p><strong>전체</strong></p>` + 마침표/물음표/느낌표 없음 + 60자 이내 |
| `<p>` | `<!-- wp:paragraph -->` | **본문 내 하이퍼링크 금지** → 유입링크로 분리 |
| `<p>` 내 `<a>` | 유입링크 시퀀스 | `<a>` 태그 제거 → 텍스트만 남기고 문단 아래 유입링크 추가 |
| 연속 이미지 2개 | `<!-- wp:columns -->` | 이미지 2개 컬럼 블록 패턴 사용 |
| Ghost 갤러리 카드 | `<!-- wp:columns -->` | `kg-gallery-card` → 2개씩 컬럼 블록 |
| `<figure><img>` | `<!-- wp:image -->` + 가운데 정렬 | 가로형 700px, 세로형 467px, 앞뒤 40px 스페이서 |
| `<figcaption>` | `<sup>` 태그로 감싸기 | 출처 prefix 자동 정규화 (이미지/동영상 분기) |
| YouTube iframe | `<!-- wp:embed -->` 블록 | providerNameSlug: youtube, 16:9. 캡션은 "동영상 출처:" prefix |
| Ghost 버튼 카드 | 유입링크 고정 시퀀스 | kg-button-card → 텍스트 링크로 변환 |
| `<blockquote>` | `<!-- wp:quote -->` | 색상 #9d9d9d, 이탤릭, 큰따옴표 |
| `<hr>` | 40px 스페이서 + 구분선(5701) | |
| Ghost bookmark | 유입링크 고정 시퀀스 | spacer→구분선→spacer→링크→spacer→구분선 |
| `<ul>/<ol>` | `<!-- wp:list -->` | 색상 #9d9d9d만 (폰트 크기는 WP 기본 유지) |
| 결문 (제목 없는 마지막 섹션) | 구분선 + 100px 스페이서 + 본문 | hr 이후 h2가 없으면 자동 적용 |

### 본문 하이퍼링크 → 유입링크 변환 규칙

Ghost 본문 `<p>` 태그 내에 `<a>` 하이퍼링크가 있을 경우:
1. **WP에서 인라인 하이퍼링크 절대 사용 금지** (모든 컨텍스트에 동일 적용)
2. `<a>` 태그를 제거하고 텍스트만 남김 (예: `<a href="...">갤러리</a>` → `갤러리`)
3. 추출된 링크는 문단 아래에 유입링크 시퀀스로 분리 출력
4. 유입링크 워딩은 URL을 분석하여 자동 결정 (`classifyInflowLink` 로직)

### 하이퍼링크 strip이 적용되는 위치

| 위치 | 처리 |
|------|------|
| 본문 `<p>` | `<a>` 제거 + 유입링크로 분리 출력 |
| 헤딩 (h2~h4) | `<a>` 제거 (텍스트만 유지) |
| 리스트 (`<li>`) | `<a>` 제거 (텍스트만 유지) |
| 캡션 (figcaption) | 모든 인라인 태그 strip |
| 인용 (blockquote) | 모든 인라인 태그 strip |

### 이미지 컬럼 블록 규칙

연속된 이미지 2개 또는 Ghost 갤러리 카드(`kg-gallery-card`)는 WP 컬럼 블록으로 변환:
```
<!-- wp:columns {"metadata":{"categories":[],"patternName":"core/block/20329","name":"이미지 2개 컬럼"}} -->
<div class="wp-block-columns"><!-- wp:column -->
<div class="wp-block-column"><!-- wp:image {"align":"center"} -->
<figure class="wp-block-image aligncenter"><img src="..." alt=""/></figure>
<!-- /wp:image --></div>
<!-- /wp:column -->

<!-- wp:column -->
<div class="wp-block-column"><!-- wp:image {"align":"center"} -->
<figure class="wp-block-image aligncenter"><img src="..." alt=""/></figure>
<!-- /wp:image --></div>
<!-- /wp:column --></div>
<!-- /wp:columns -->
```
- 갤러리 이미지가 홀수인 경우 마지막 1개는 단일 이미지로 출력
- 컬럼 블록 앞뒤에 40px 스페이서 적용

### 유입링크 고정 시퀀스 (순서 변경 금지)

```
<!-- wp:block {"ref":19650} /-->   ← 40px
<!-- wp:block {"ref":5701} /-->    ← 구분선
<!-- wp:block {"ref":19912} /-->   ← 20px
(링크 문구, 가운데 정렬, 15px, target="_blank")
<!-- wp:block {"ref":19767} /-->   ← 10px
<!-- wp:block {"ref":5701} /-->    ← 구분선
```

### 아티클 종결 시퀀스 (순서 변경 금지)

```
<!-- wp:block {"ref":19650} /-->   ← 40px
<!-- wp:block {"ref":5701} /-->    ← 구분선
<!-- wp:block {"ref":19912} /-->   ← 20px
<!-- wp:shortcode -->              ← 에디터 카드 (shortcode)
<!-- /wp:shortcode -->
<!-- wp:block {"ref":19912} /-->   ← 20px
<!-- wp:block {"ref":19773} /-->   ← 에디터 카드 꼬리
```

### 100px 스페이서 형식

WP 기본값이 100px이므로 빈 태그 사용: `<!-- wp:spacer --><!-- /wp:spacer -->`

## 카테고리 매핑 (category-mapper.ts)

### 그레이 vs 큐레이션 분기 (Notion 우선)

그레이 판별의 단일 진실 원천은 **Notion `🔴 콘텐츠 종류`** 필드. (이전엔 `🔴 카테고리`에서 판별했으나 누락 케이스 다수 → 별도 필드로 분리)

| Notion 🔴 콘텐츠 종류 | WP 카테고리 | 추가 처리 |
|----|----|----|
| GRAY / 그레이 | **매거진(25) + 그레이(78)** 만 | `🔴 카테고리` 무시, 대표이미지 흑백 변환, ANTIEGG 태그 자동 제외 |
| CURATION / 큐레이션 | 매거진(25) + 큐레이션(77) + `🔴 카테고리` 매핑 | ANTIEGG 태그 자동 제외 |
| (Notion 미연동) | Ghost 태그 폴백 → CATEGORY_MAP 기반 | - |

### 카테고리 ID 매핑

| 카테고리 | WP ID |
|-----------|-------|
| 매거진 (모든 글 공통) | 25 |
| 큐레이션 | 77 |
| 그레이 | 78 |
| 아트 | 112 |
| 컬쳐 | 122 |
| 디자인 | 113 |
| 라이프스타일 | 125 |
| 미디어 | 120 |
| 피플 | 3253 |
| 플레이스 | 3252 |
| 브랜드 | 3251 |

카테고리 추가/변경 시 `CATEGORY_MAP` 배열에 행 추가. WP ID는 WP 관리자 → 글 → 카테고리에서 확인 가능.

## 에디터 매칭 (author-filter.ts)

| 원칙 | 동작 |
|------|------|
| 단일 진실 원천 | **WP 등록 에디터 이름** (sync 과정에서 자동 변경 금지) |
| 매칭 1순위 | Ghost 작성자 이름 ↔ WP user.name **완전 일치** (대소문자/공백 무시) |
| 매칭 2순위 | 동명이인 발생 시에만 슬러그로 disambiguate |
| 매칭 실패 시 | `skipped_no_author` (WP에서 직접 등록 후 재동기화) |
| 에디터 카드 템플릿 | `editor-card.ts` `EDITOR_TEMPLATE_MAP`에서 `wpUserId → templateId` 직접 매핑 |

### 변경 이력
- 이전: 슬러그 우선 매칭 + WP user.name 자동 갱신(`updateWpUserName`) → 동명이인/유사 슬러그 케이스에서 잘못 매칭 + 표시 이름 덮어쓰기 사고
- 현재: 풀네임 우선 + WP 사용자 자동 갱신 제거 (WP가 단일 진실 원천)

### 신규 에디터 등록
1. WP 표시 이름을 Ghost 이름과 일치시킴
2. `editor-card.ts`의 `EDITOR_TEMPLATE_MAP`에 `wpUserId → templateId` 한 줄 추가

## 이미지 처리 (image-handler.ts)

| 케이스 | 처리 |
|--------|------|
| Ghost 이미지 (`square.antiegg.kr/content/images/...`) | WP 미디어 라이브러리에 업로드 후 URL 교체 |
| webp 확장자 | sharp로 jpg 변환 후 업로드 (품질 90) |
| 그레이 아티클 대표이미지 | sharp `.grayscale()` 변환 후 jpg로 업로드 |
| 가로형/정방형 | width 700px |
| 세로형 | width 467px |
| 캡션 내 하이퍼링크 | strip |

### 그레이 흑백 변환 트리거
`uploadFeatureImage(url, dryRun, isGray)`의 `isGray`가 `true`면 `downloadGrayscaleAndUpload` 경로로 분기.
`isGray`는 `sync-routes.ts`에서 Notion `🔴 콘텐츠 종류` 필드 기준으로 산출.

## CLI 사용법

```bash
npm run sync:dry                          # dry-run (미리보기)
npm run sync                              # 새 글만 동기화 (draft)
npm run sync:all                          # 전체 동기화
npx tsx src/index.ts --slug "슬러그"       # 특정 글만
npx tsx src/index.ts --publish            # publish 상태로 발행
npx tsx src/index.ts --slug "x" --dry-run # 조합 가능
```

## 작업 시 주의사항

- **반드시 dry-run 먼저** — 실제 동기화 전 매핑 결과 확인
- **draft 상태 권장** — WP 관리자에서 HTML 검수 후 publish
- **html-transformer.ts 수정 시** — 기존 WP 아티클(예: ID 32747)과 HTML 구조 비교 필수
- **재사용 블록 ID 변경 금지** — WP DB에 종속된 값. 변경하면 전체 아티클 깨짐
- **이미지 URL** — Ghost 이미지는 `square.antiegg.kr/content/images/...` 패턴. WP 업로드 후 URL 자동 교체됨

## 테스트/검증 방법

1. `--dry-run`으로 실행 → 매핑 결과 확인
2. `--slug`으로 1개 아티클 draft 생성 → WP 관리자에서 HTML 검수
3. 기존 WP 아티클(수동 업로드된 것)과 새 아티클의 HTML 구조 비교
4. 정상 확인 후 전체 동기화

## 유입링크 규칙 (html-transformer.ts)

### 텍스트 포맷팅 (WP 실제 아티클 패턴 기반)
- **Instagram URL** → `INSTAGRAM : @아이디` (원본 텍스트 무시, URL에서 추출)
- **행동 유도 텍스트** (~가기, ~보기) → Ghost 원본 텍스트 유지
- **북마크 타이틀** 있는 경우 → `WEBSITE : [브랜드명]`
- **텍스트 없음** (URL만) → `WEBSITE : [도메인명]`

### 브랜드명 자동 정규화 (`stripWebsiteSuffix`)
- 끝의 `(공식) 웹사이트/홈페이지/사이트` 접미사 자동 제거
  - 예: `타이거모닝 웹사이트` → `WEBSITE : 타이거모닝`
  - 예: `안티에그 공식 홈페이지` → `WEBSITE : 안티에그`
- 이미 `WEBSITE :` prefix가 있는 경우 중복 추가 금지
  - 예: `WEBSITE : 타이거모닝` → `WEBSITE : 타이거모닝` (그대로)

### 그룹 렌더링 (연속 유입링크)
여러 유입링크가 연속되면 하나의 `<p>` 태그에 `<br>`로 연결 (WP #32837 패턴).
정렬 순서: website(0) → instagram(1) → action(2).
구분선/스페이서는 그룹 단위로 한 번만 사용.

### 단일 유입링크 시퀀스
```
40px(19650) → divider(5701) → 20px(19912) → <p 15px center>링크</p> → 10px(19767) → divider(5701)
```

## H2/H3 규칙 (WP #33050 기준 학습)

### H2: 항상 구분선 + 100px 스페이서
Ghost에 `<hr>`이 없어도 WP에서는 **항상** 다음 시퀀스 적용:
```
40px(19650) → divider(5701) → 100px spacer → H2 heading → 40px(19650)
```
- 20자(띄어쓰기 포함) 초과 시 가장 가까운 중간 공백에서 `<br>` 줄바꿈

### H3: 위·아래 40px (반복 시 위 70px)
- **첫 번째 H3**: 위 40px(19650), 아래 40px(19650)
- **두 번째 이후 H3** (반복): 위 70px(27530), 아래 40px(19650)
- H2를 만나면 H3 카운트 리셋
- H3 다음 요소가 자체 위 40px을 push해도 dedup으로 중복 제거됨

### H4: 위·아래 40px

### 단독 bold 문단 → H3 자동 승격

Ghost 에디터에서 H3 블록 대신 `<p><strong>제목</strong></p>` 패턴으로 부제목을 마크업한 경우 자동으로 H3로 변환. 모든 조건 충족 시:

1. `<p>` 내용이 단 하나의 `<strong>` (앞뒤 텍스트 없음 → 문단 중간 강조 제외)
2. 텍스트가 마침표·물음표·느낌표·말줄임표(`.!?…。．？！`)로 끝나지 않음 (완성 문장 강조 제외)
3. 60자 이내 (헤딩 길이 휴리스틱)

`promoteBoldOnlyParagraphsToH3` 함수가 처리. 위치 무관 (H2 직후뿐 아니라 어디든 적용).

## SEO/소셜 메타 (Yoast)

동기화 시 자동 설정되는 Yoast 필드:
| 필드 | 값 |
|------|------|
| 초점 키프레이즈 | 제목에 포함된 Notion 키워드/테마/Ghost 태그 중 첫 매칭, 없으면 첫 항목 |
| 슬러그 | 제목 영어 번역 (Google Translate API, 없으면 Ghost slug 사용) |
| 메타 설명 | `부제목 \| 바이럴멘트` (이모지 자동 제거, 140자 컷, 마지막 완성 문장 기준 자름) |
| 소셜 제목 | `%%title%% %%sep%% %%sitename%% %%primary_category%%` |
| 소셜 설명 | 메타 설명과 동일 |
| 소셜 이미지 | 대표이미지와 동일 (그레이는 흑백 처리된 이미지) |

## 발행일 로직

Notion 발행일 우선, 없으면 Ghost 발행일 기준 직전 금요일.
- Notion 발행일 사용 (시간 미포함 시 KST 07:50 자동 부여)
- Notion 미연동 또는 발행일 없을 시: Ghost `published_at` 기준 직전 금요일 (예: Ghost 4/13 일요일 → WP draft 4/10 금요일)
- 자동 동기화(cron)는 매주 금요일 09:00 UTC ≈ 11:00 KST 실행, status=`future`로 예약

## 환경변수

| 변수 | 필수 | 용도 |
|------|------|------|
| `GHOST_API_URL` | O | Ghost API URL |
| `GHOST_ADMIN_API_KEY` | O | Ghost Admin API 키 |
| `WP_API_URL` | O | WordPress API URL |
| `WP_USERNAME` | O | WP 사용자명 |
| `WP_APP_PASSWORD` | O | WP 앱 비밀번호 |
| `GOOGLE_TRANSLATE_API_KEY` | X | 슬러그 영어 번역 (없으면 Ghost slug 사용) |

## Notion 아티클 로드맵 연동 (notion-client.ts)

### DB 정보
- **DB ID**: 환경변수 `NOTION_ARTICLE_DB_ID`
- **매칭 방식**: Ghost 슬러그 ↔ Notion "Square CMS" URL 필드 (url.contains 필터)

### 데이터 흐름 (Notion 우선, Ghost 폴백)

| 용도 | Notion 필드 | Ghost 폴백 | 적용 위치 |
|------|------------|-----------|----------|
| Yoast 메타 설명 | 바이럴 멘트 | custom_excerpt | sync-routes.ts `metaDesc` |
| WP 발행일 | 발행일 | Ghost published_at → 직전 금요일 | sync-routes.ts `wpDate` |
| 부제목 | 부제목 | custom_excerpt | 폴백용 |

### Notion DB 필드 구조

| 필드명 | 타입 | 용도 |
|-------|------|------|
| 아티클 제목 | title | 제목 |
| 바이럴 멘트 | rich_text | Yoast 메타 설명 |
| 부제목 | rich_text | 메타 설명 폴백 |
| 발행일 | date | WP 발행일 |
| 상태 | select | 진행 상태 |
| Square CMS | url | Ghost 슬러그 매칭 키 |
| **🔴 콘텐츠 종류** | select / multi_select | **그레이 판별 단일 진실 원천** (GRAY/그레이/CURATION/큐레이션) |
| 🔴 카테고리 | multi_select | 큐레이션 서브카테고리 (그레이일 때는 무시) |
| 🔴 키워드 | multi_select | WP 태그 |
| 🔴 테마 | multi_select | WP 태그 |
| 기타 | multi_select | WP 태그 (큐레이션/그레이 발행 시 ANTIEGG는 자동 제외) |

### 환경변수

| 변수 | 필수 | 용도 |
|------|------|------|
| `NOTION_API_KEY` | X | Notion Internal Integration 토큰 |
| `NOTION_ARTICLE_DB_ID` | X | 아티클 로드맵 DB ID |

Notion 환경변수가 없으면 자동으로 Ghost 데이터만 사용 (graceful fallback).

## 확장 예정 / 진행 중

- [x] 카테고리 위계 (매거진 → 큐레이션 → 서브카테고리, 매거진 → 그레이) — 완료
- [x] Notion 발행일/바이럴멘트 연동 — 완료
- [x] 자동 동기화 (금요일 cron + GitHub Actions) — 완료
- [x] 그레이 아티클 흑백 대표이미지 자동 변환 — 완료 (2026-05-10 버그 수정)
- [x] webp → jpg 자동 변환 — 완료
- [x] 단독 bold 문단 H3 자동 승격 — 완료
- [ ] 네이버 블로그 자동 발행 — API 반려, Playwright PoC 진행 중
- [ ] 특정 날짜 이후 포스트만 동기화 (`--after "2026-01-01"`)
- [ ] 단발성 단독 bold 문단 오변환 안전장치 추가 (필요 시)

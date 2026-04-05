# CLAUDE.md

## 프로젝트 개요

Ghost CMS(square.antiegg.kr)에 발행된 아티클을 WordPress(antiegg.kr)로 자동 이전하는 CLI 도구.
ANTIEGG 매거진 운영팀이 사용하며, WP에 등록된 에디터의 글만 선별 이전한다.

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
├── index.ts             ← CLI 진입점. 전체 동기화 흐름 제어
├── ghost-client.ts      ← Ghost Admin API. JWT 토큰 생성 + 포스트 조회
├── wp-client.ts         ← WP REST API. 포스트/미디어/사용자/태그 CRUD
├── html-transformer.ts  ← [핵심] Ghost HTML → WP Block HTML 변환
├── image-handler.ts     ← 이미지 다운로드 → WP 미디어 업로드 → URL 교체
├── author-filter.ts     ← Ghost 작성자 ↔ WP 사용자 매칭
├── category-mapper.ts   ← Ghost 태그 → WP 카테고리 매핑
└── types.ts             ← 타입 정의
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
| 20px 스페이서 | `19912` | 유입링크 내 여백 |
| 10px 스페이서 | `19767` | 유입링크 내 여백 |
| 에디터 카드 꼬리 | `19773` | 아티클 종결 시퀀스 맨 끝 |

사용법: `<!-- wp:block {"ref":19650} /-->` (WP가 해당 ID의 재사용 블록을 렌더링)

### 블록 변환 규칙 요약

| Ghost 요소 | WP 변환 | 주의사항 |
|-----------|---------|---------|
| `<h2>` | `<!-- wp:heading -->` + 가운데 정렬 | 앞에 반드시 구분선+100px 스페이서, 볼드(strong) 제거 |
| `<p>` | `<!-- wp:paragraph -->` | 본문 내 링크에 `target="_blank"` 필수 |
| `<figure><img>` | `<!-- wp:image -->` + 가운데 정렬 | 가로형 700px, 세로형 467px, 앞뒤 40px 스페이서 |
| `<figcaption>` | `<sup>` 태그로 감싸기 | |
| YouTube iframe | `<!-- wp:embed -->` 블록 | providerNameSlug: youtube, 16:9 |
| Ghost 버튼 카드 | 유입링크 고정 시퀀스 | kg-button-card → 텍스트 링크로 변환 |
| `<blockquote>` | `<!-- wp:quote -->` | 색상 #9d9d9d, 이탤릭, 큰따옴표 |
| `<hr>` | 40px 스페이서 + 구분선(5701) | |
| Ghost bookmark | 유입링크 고정 시퀀스 | spacer→구분선→spacer→링크→spacer→구분선 |
| `<ul>/<ol>` | `<!-- wp:list -->` | 참고문헌 스타일: 14px, #9d9d9d |
| 결문 (제목 없는 마지막 섹션) | 구분선 + 100px 스페이서 + 본문 | hr 이후 h2가 없으면 자동 적용 |

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

| Ghost 태그 | WP 카테고리 | WP ID |
|-----------|------------|-------|
| (공통) | 매거진 | 25 |
| 아트 | 아트 | 112 |
| 컬쳐 | 칼처 | 122 |
| 큐레이션 | 큐레이션 | 77 |
| 그레이 | 그레이 | 78 |
| 브랜드 | 브랜드 | 3251 |
| 플레이스 | 플레이스 | 3252 |
| 피플 | 피플 | 3253 |
| 디자인 | 디자인 | 113 |
| 라이프스타일 | 라이프스타일 | 125 |
| 미디어 | 미디어 | 120 |

카테고리 추가/변경 시 `CATEGORY_MAP` 배열에 행 추가.
WP ID는 WP 관리자 → 글 → 카테고리에서 확인 가능.

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
- **북마크 타이틀** 있는 경우 → `WEBSITE : [타이틀]`
- **텍스트 없음** (URL만) → `WEBSITE : [도메인명]`

### 그룹 렌더링 (연속 유입링크)
여러 유입링크가 연속되면 하나의 `<p>` 태그에 `<br>`로 연결 (WP #32837 패턴).
정렬 순서: website(0) → instagram(1) → action(2).
구분선/스페이서는 그룹 단위로 한 번만 사용.

### 단일 유입링크 시퀀스
```
40px(19650) → divider(5701) → 20px(19912) → <p 15px center>링크</p> → 10px(19767) → divider(5701)
```

## H2/H3 규칙

- H2: 20자(띄어쓰기 포함) 초과 시 가장 가까운 중간 공백에서 `<br>` 줄바꿈
- H3: 문단 구분 시 70px 스페이서(27530) 사용

## SEO/소셜 메타 (Yoast)

동기화 시 자동 설정되는 Yoast 필드:
| 필드 | 값 |
|------|------|
| 초점 키프레이즈 | Ghost 첫 번째 태그명 |
| 슬러그 | 제목 영어 번역 (Google Translate API) |
| 메타 설명 | `부제목 \|` (추후 Notion 바이럴멘트 연동) |
| 소셜 제목 | `%%title%% %%sep%% %%sitename%% %%primary_category%%` |
| 소셜 설명 | 메타 설명과 동일 |
| 소셜 이미지 | 대표이미지와 동일 |

## 발행일 로직

Ghost 발행일 기준 직전 금요일을 WP draft 날짜로 설정.
(예: Ghost 4/13 일요일 → WP draft 4/10 금요일)
추후 Notion 발행일로 교체 가능.

## 환경변수

| 변수 | 필수 | 용도 |
|------|------|------|
| `GHOST_API_URL` | O | Ghost API URL |
| `GHOST_ADMIN_API_KEY` | O | Ghost Admin API 키 |
| `WP_API_URL` | O | WordPress API URL |
| `WP_USERNAME` | O | WP 사용자명 |
| `WP_APP_PASSWORD` | O | WP 앱 비밀번호 |
| `GOOGLE_TRANSLATE_API_KEY` | X | 슬러그 영어 번역 (없으면 Ghost slug 사용) |

## 확장 예정

- [ ] Notion DB 연동 (바이럴멘트, 발행일)
- [ ] 카테고리 위계 (매거진 → 큐레이션 → 카테고리 / 그레이)
- [ ] 동기화 로그 파일 출력
- [ ] 특정 날짜 이후 포스트만 동기화 (`--after "2026-01-01"`)

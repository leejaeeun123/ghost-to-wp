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

사용법: `<!-- wp:block {"ref":19650} /-->` (WP가 해당 ID의 재사용 블록을 렌더링)

### 블록 변환 규칙 요약

| Ghost 요소 | WP 변환 | 주의사항 |
|-----------|---------|---------|
| `<h2>` | `<!-- wp:heading -->` + 가운데 정렬 | 앞에 반드시 구분선+100px 스페이서 |
| `<p>` | `<!-- wp:paragraph -->` | 본문 내 링크에 `target="_blank"` 필수 |
| `<figure><img>` | `<!-- wp:image -->` + 가운데 정렬 | 가로형 700px, 세로형 467px, 앞뒤 40px 스페이서 |
| `<figcaption>` | `<sup>` 태그로 감싸기 | |
| `<blockquote>` | `<!-- wp:quote -->` | 색상 #9d9d9d, 이탤릭, 큰따옴표 |
| `<hr>` | 40px 스페이서 + 구분선(5701) | |
| Ghost bookmark | 유입링크 고정 시퀀스 | spacer→구분선→spacer→링크→spacer→구분선 |
| `<ul>/<ol>` | `<!-- wp:list -->` | 참고문헌 스타일: 14px, #9d9d9d |

### 유입링크 고정 시퀀스 (순서 변경 금지)

```
<!-- wp:block {"ref":19650} /-->   ← 40px
<!-- wp:block {"ref":5701} /-->    ← 구분선
<!-- wp:block {"ref":19912} /-->   ← 20px
(링크 문구, 가운데 정렬, 15px, target="_blank")
<!-- wp:block {"ref":19767} /-->   ← 10px
<!-- wp:block {"ref":5701} /-->    ← 구분선
```

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

## 확장 예정

- [ ] 카테고리 위계 (매거진 → 큐레이션 → 카테고리 / 그레이)
- [ ] 예약 발행 (`--schedule "2026-04-01T09:00:00"`)
- [ ] 동기화 로그 파일 출력
- [ ] 특정 날짜 이후 포스트만 동기화 (`--after "2026-01-01"`)

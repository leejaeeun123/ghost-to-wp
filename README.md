# Ghost → WordPress 아티클 자동 이전 도구

Ghost(square.antiegg.kr)에 발행된 아티클을 WordPress(antiegg.kr)로 자동 이전하는 CLI 도구.

---

## 목차

1. [개요](#개요)
2. [사전 준비](#사전-준비)
3. [설치](#설치)
4. [환경변수 설정](#환경변수-설정)
5. [사용법](#사용법)
6. [동작 방식](#동작-방식)
7. [카테고리 매핑](#카테고리-매핑)
8. [HTML 변환 규칙](#html-변환-규칙)
9. [주의사항](#주의사항)
10. [트러블슈팅](#트러블슈팅)
11. [파일 구조](#파일-구조)

---

## 개요

### 핵심 규칙

- **WP에 등록된 사용자(에디터)의 글만 이전** — Ghost에만 있는 에디터의 글은 자동으로 스킵
- Ghost HTML을 **ANTIEGG WP 블록 에디터 규격**으로 변환 (재사용 블록 ID, 스페이서, 구분선 포함)
- 기본적으로 **draft 상태**로 생성 — WP 관리자에서 검수 후 publish 전환

### 처리 흐름

```
Ghost Admin API → 포스트 로드
       ↓
WP 사용자 목록 → 작성자 매핑
       ↓
각 포스트:
  ├─ WP에 동일 slug 존재? → 스킵
  ├─ 작성자 WP에 없음? → 스킵
  ├─ 이미지 다운로드 → WP 미디어 업로드 → URL 교체
  ├─ Ghost HTML → WP Block HTML 변환
  ├─ Ghost 태그 → WP 카테고리/태그 매핑
  └─ WP 포스트 생성 (draft)
       ↓
결과 리포트 출력
```

---

## 사전 준비

### 필수 환경

| 항목 | 버전 |
|------|------|
| Node.js | v20 이상 |
| npm | v10 이상 |

### 필요한 인증 정보

| 항목 | 발급 위치 | 형식 |
|------|-----------|------|
| Ghost Admin API Key | Ghost 관리자 → Settings → Integrations → Custom | `{id}:{secret}` |
| WP Username | WP 관리자 계정 | 문자열 |
| WP Application Password | WP 관리자 → 사용자 → 프로필 → 애플리케이션 비밀번호 | `xxxx xxxx xxxx xxxx` |

---

## 설치

```bash
git clone <이 레포 URL>
cd ghost-to-wp
npm install
```

---

## 환경변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 열어 값을 채워주세요:

```env
# Ghost Admin API (square.antiegg.kr)
GHOST_API_URL=https://square.antiegg.kr
GHOST_ADMIN_API_KEY=발급받은키:시크릿

# WordPress REST API (antiegg.kr)
WP_API_URL=https://antiegg.kr
WP_USERNAME=your-wp-username
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

### Ghost Admin API Key 발급 방법

1. https://square.antiegg.kr/ghost/#/settings/integrations 접속
2. "Add custom integration" 클릭
3. 이름 입력 (예: `ghost-to-wp`)
4. 생성된 **Admin API Key** 복사 (형식: `64자id:64자secret`)

### WP Application Password 발급 방법

1. https://antiegg.kr/wp-admin/profile.php 접속
2. 하단 "애플리케이션 비밀번호" 섹션
3. 이름 입력 (예: `ghost-to-wp`) → "새 애플리케이션 비밀번호 추가" 클릭
4. 생성된 비밀번호 복사 (공백 포함, 한 번만 표시됨)

---

## 사용법

### 기본: dry-run (미리보기, 실제 업로드 없음)

```bash
npm run sync:dry
```

실제로 WP에 아무것도 생성하지 않고, 매핑 결과와 변환 결과만 출력합니다.
**반드시 dry-run을 먼저 실행하여 결과를 확인하세요.**

### 새 글만 동기화 (기본)

```bash
npm run sync
```

WP에 아직 없는 포스트만 draft 상태로 생성합니다.

### 전체 동기화

```bash
npm run sync:all
```

### 특정 글만 동기화

```bash
npx tsx src/index.ts --slug "아티클-슬러그"
```

### publish 상태로 바로 발행

```bash
npx tsx src/index.ts --publish
```

### 옵션 조합

```bash
# 특정 글을 dry-run
npx tsx src/index.ts --slug "my-article" --dry-run

# 전체를 publish 상태로 동기화
npx tsx src/index.ts --all --publish
```

---

## 동작 방식

### 작성자 매핑

Ghost 작성자와 WP 사용자를 자동으로 매칭합니다:

1. **slug 일치** — Ghost `jaeun` ↔ WP `jaeun`
2. **이름 일치** — Ghost `이재은` ↔ WP `이재은`
3. **slug 정규화** — Ghost `jae-un` → `jaeun` ↔ WP `jaeun`

매칭 안 되는 Ghost 작성자의 글은 자동으로 스킵됩니다.

### 이미지 처리

1. Ghost 본문 내 `square.antiegg.kr/content/images/...` URL 감지
2. 이미지 다운로드 → WP 미디어 라이브러리 업로드
3. 본문 내 URL을 WP 미디어 URL로 교체
4. 대표 이미지(feature_image)도 별도 업로드

### 중복 방지

- WP에 동일 `slug`의 포스트가 이미 존재하면 자동 스킵
- 여러 번 실행해도 안전합니다 (멱등성)

---

## 카테고리 매핑

Ghost의 태그를 WP 카테고리로 자동 변환합니다.

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

- 모든 포스트에 "매거진"(25) 카테고리 자동 추가
- 위 테이블에 없는 Ghost 태그는 WP 태그로 생성됩니다

### 카테고리 추가/수정 방법

`src/category-mapper.ts`의 `CATEGORY_MAP` 배열을 수정하세요:

```typescript
{ ghostTag: "새카테고리", wpCategoryId: 9999, wpCategoryName: "새카테고리" },
```

---

## HTML 변환 규칙

Ghost HTML을 ANTIEGG WP 블록 에디터 규격으로 변환합니다.

### 재사용 블록 ID

| 블록 | WP ID | 용도 |
|------|-------|------|
| 구분선 | 5701 | 섹션 구분 |
| 40px 스페이서 | 19650 | 기본 여백 |
| 20px 스페이서 | 19912 | 유입링크 여백 |
| 10px 스페이서 | 19767 | 유입링크 여백 |

### 변환 대응표

| Ghost 요소 | WP 변환 |
|-----------|---------|
| `<h2>` | `<!-- wp:heading -->` + 가운데 정렬 + 앞에 구분선/스페이서 |
| `<p>` | `<!-- wp:paragraph -->` |
| `<figure><img>` | `<!-- wp:image -->` + 가로700px/세로467px + 앞뒤 40px 스페이서 |
| `<figcaption>` | `<figcaption><sup>텍스트</sup></figcaption>` |
| `<blockquote>` | `<!-- wp:quote -->` + 색상 #9d9d9d + 이탤릭 |
| `<hr>` | 40px 스페이서 + 구분선(5701) |
| Ghost bookmark | 유입링크 고정 시퀀스 (spacer→구분선→링크→구분선) |
| `<ul>/<ol>` | `<!-- wp:list -->` + 14px #9d9d9d (참고문헌 스타일) |

### 에디터 카드

변환 결과 하단에 `<!-- EDITOR CARD TEMPLATE 자리 (수동 삽입) -->` 표시.
WP 관리자에서 에디터 카드 블록을 수동으로 삽입해주세요.

---

## 주의사항

1. **반드시 dry-run 먼저 실행** — `npm run sync:dry`로 결과 확인 후 실제 동기화
2. **draft 상태 권장** — 기본값이 draft이므로, WP 관리자에서 HTML/레이아웃 검수 후 publish
3. **이미지 용량** — Ghost에 고용량 이미지가 많으면 동기화 시간이 길어질 수 있음
4. **한 번에 전체 실행보다** — `--slug` 옵션으로 개별 아티클 테스트 후 전체 실행 권장
5. **에디터 카드** — 자동 삽입되지 않음. WP 관리자에서 수동 추가 필요

---

## 트러블슈팅

### "Ghost API 오류 (401)"

→ `GHOST_ADMIN_API_KEY` 확인. 형식: `{id}:{secret}` (콜론으로 구분)

### "WordPress 포스트 생성 실패 (401)"

→ `WP_APP_PASSWORD` 확인. 공백 포함하여 정확히 입력했는지 확인

### "이미지 다운로드 실패"

→ Ghost 서버(square.antiegg.kr)에 해당 이미지가 존재하는지 확인.
→ 삭제된 이미지면 Ghost 관리자에서 원본 확인

### "작성자 매핑 안 됨"

→ Ghost 작성자의 slug/이름과 WP 사용자의 slug/이름이 일치하지 않음.
→ WP 관리자에서 해당 사용자의 slug을 Ghost와 맞추거나, `src/author-filter.ts`에 수동 매핑 추가

### WP에서 블록이 "클래식" 블록으로 표시

→ HTML 변환 규칙에 누락이 있을 수 있음.
→ `src/html-transformer.ts` 확인. `<!-- wp:... -->` 코멘트가 정확히 포함되어야 함

---

## 파일 구조

```
ghost-to-wp/
├── .env.example          ← 환경변수 템플릿
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md             ← 이 문서
└── src/
    ├── index.ts           ← CLI 진입점 (실행 흐름 제어)
    ├── ghost-client.ts    ← Ghost Admin API (JWT 인증, 포스트 조회)
    ├── wp-client.ts       ← WP REST API (포스트 생성, 미디어 업로드, 사용자 조회)
    ├── html-transformer.ts ← Ghost HTML → WP Block HTML 변환 (핵심)
    ├── image-handler.ts   ← 이미지 다운로드 + WP 업로드 + URL 교체
    ├── author-filter.ts   ← Ghost 작성자 ↔ WP 사용자 매칭
    ├── category-mapper.ts ← Ghost 태그 → WP 카테고리 매핑
    └── types.ts           ← TypeScript 타입 정의
```

### 각 파일 역할

| 파일 | 수정 빈도 | 재은님 수정 가능 여부 |
|------|-----------|---------------------|
| `category-mapper.ts` | 카테고리 추가/변경 시 | O — 매핑 테이블 수정만 |
| `author-filter.ts` | 작성자 매칭 안 될 때 | O — 매칭 로직 단순 |
| `html-transformer.ts` | WP 블록 규격 변경 시 | △ — WP 블록 구조 이해 필요 |
| `ghost-client.ts` | Ghost API 변경 시 | △ |
| `wp-client.ts` | WP API 변경 시 | △ |
| `image-handler.ts` | 이미지 처리 규칙 변경 시 | △ |
| `index.ts` | CLI 옵션 추가 시 | O |
| `types.ts` | 타입 추가 시 | O |

---

## 추후 확장 예정

- [ ] 카테고리 위계 (매거진 → 큐레이션 → 카테고리 / 그레이)
- [ ] 예약 발행 (`--schedule "2026-04-01T09:00:00"`)
- [ ] 동기화 로그 파일 출력
- [ ] 특정 날짜 이후 포스트만 동기화 (`--after "2026-01-01"`)

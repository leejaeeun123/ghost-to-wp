# ANTIEGG · Ghost → WP 본문 변환 규칙 (2026-05-16 보강)

> Ghost CMS → WordPress 변환 시 본문 콘텐츠 처리 규칙 모음. CLAUDE.md의 핵심 변환 규칙을 보완하여, 에디터가 자주 만드는 입력 패턴별로 변환 분기를 명시한다.
>
> 최종 업데이트: 2026-05-16

---

## 1. 외부 하이퍼링크 워딩 규칙

본문 또는 별도 블록에 외부 하이퍼링크가 포함된 경우, URL 도메인의 성격에 따라 anchor text 처리를 분기한다.

### 1.1 브랜드 공식 홈페이지

- 에디터가 `안티에그 홈페이지`, `안티에그 보러가기` 등 브랜드로 유입을 유도하는 표현을 작성한 경우
- **WP 변환 시 anchor text를 `WEBSITE : [브랜드명]`으로 통일**
- `홈페이지`, `공식 홈페이지`, `사이트` 등 접미사는 모두 제거

| 에디터 원본 | WP 변환 |
|---|---|
| 안티에그 홈페이지 | `WEBSITE : 안티에그` |
| 안티에그 보러가기 | `WEBSITE : 안티에그` |
| 타이거모닝 웹사이트 | `WEBSITE : 타이거모닝` |
| 안티에그 공식 홈페이지 | `WEBSITE : 안티에그` |

처리 함수: `classifyInflowLink` + `stripWebsiteSuffix` (`html-transformer.ts`)

### 1.2 비공식 외부 링크 (지도, 예약 페이지 등)

- 구글지도, 네이버지도, 예약 페이지 등 브랜드 공식 사이트가 아닌 외부 링크
- **`WEBSITE :` 라벨 사용 금지**
- 에디터가 작성한 유도 문구를 그대로 anchor text로 사용

| 에디터 원본 | WP 변환 |
|---|---|
| 이치노유 목욕탕 방문하기 (구글맵 링크) | `이치노유 목욕탕 방문하기` |
| 식당 예약하기 (네이버 예약) | `식당 예약하기` |

사례: https://antiegg.kr/?p=34698

---

## 2. 본문 산문 내 인라인 하이퍼링크 → 유입링크 블록 분리

에디터가 본문 산문(prose) 안에 외부 사이트 하이퍼링크를 박아 넣은 경우의 처리.

### 2.1 변환 절차

1. **본문에서 인라인 하이퍼링크 완전 제거** — `<a>` 태그를 풀고 텍스트만 plain text로 남김
2. **추출한 링크는 해당 위치가 속한 섹션 끝**에 별도 유입링크 블록으로 재배치
   - 글 마지막에 일괄 모으는 것은 금지
3. **anchor text는 에디터가 쓴 워딩 그대로 보존** (정규화 금지)
   - 다만 본 문서 §1 규칙에 따라 공식 홈페이지일 때만 `WEBSITE :` 프리픽스 분기

### 2.2 음반/스트리밍 사이트 링크 (대표 케이스)

산문 안에 앨범 정보와 함께 Spotify/Apple Music/YouTube Music/Melon/Bugs/Genie 등 음원 스트리밍 URL이 박혀 있는 패턴. (자주 사용하는 에디터: 김강민)

- 본문은 깔끔한 plain text로 정리
- 각 아티스트/주제 섹션 끝마다 그 섹션에서 언급된 음반 링크만 묶어 §4의 표준 유입링크 블록으로 출력
- anchor text는 에디터 원본 그대로 (예: `글렌 굴드 [바흐: 골드베르크 변주곡] (1955)`)

### 2.3 사례

- 원본: https://square.antiegg.kr/interpretations-evolve/
- 변환본: antiegg.kr `?p=34704`

---

## 3. Ghost가 이미 별도 블록으로 업로드한 유입링크 → 그대로 표준 블록화

Ghost 원본에서 산문과 분리된 블록(별도 paragraph/button/callout 등)으로 외부 링크를 업로드한 경우.

- 이미 유입링크 의도가 명확한 상태이므로 본문에서 추출하거나 재구조화할 필요 없음
- §4의 표준 WP 유입링크 블록 포맷으로 곧바로 변환
- anchor text는 에디터 원본 그대로 (단, §1의 공식 홈페이지 분기는 적용)

사례: https://square.antiegg.kr/trustandreality/ 의 `돈키호테 구매하러 가기 (교보문고)` 유입링크

---

## 4. 표준 WP 유입링크 블록 포맷

§2, §3 모두 출력은 동일한 표준 블록을 사용한다.

### 4.1 블록 구조

```html
<!-- wp:block {"ref":5701} /-->
<!-- wp:block {"ref":19912} /-->
<!-- wp:paragraph {"align":"center","style":{"typography":{"fontSize":"15px"}}} -->
<p class="has-text-align-center" style="font-size:15px"><a href="[외부 URL]">[anchor text]</a></p>
<!-- /wp:paragraph -->
<!-- wp:block {"ref":19767} /-->
<!-- wp:block {"ref":5701} /-->
```

### 4.2 구성

- 바깥 wrapper: `wp:block ref=5701` (구분선) — 앞뒤 1쌍
- 안쪽 wrapper: `wp:block ref=19912` (시작 마커) ... `wp:block ref=19767` (종료 마커)
- 본문: center 정렬 paragraph, `font-size:15px`
- anchor 여러 개를 묶을 때는 한 `<p>` 안에서 `<br>`로 줄바꿈

### 4.3 변형

- **단일 링크**: 위 기본 구조 그대로
- **복수 링크 (음반 케이스)**: 한 `<p>` 안에 `<br>`로 줄바꿈, anchor 여럿. 외부 새창 열기가 필요한 경우 `target="_blank" rel="noreferrer noopener"` 추가

---

## 5. 이미지 N개 나란히 배치 → 컬럼 블록

Ghost 원본에서 여러 이미지를 연달아 배치한 경우 (특히 3개 작품을 비교 보여주는 케이스 등).

### 5.1 변환 규칙

- **3개 이미지** → `wp:columns` 블록 + 3개 `wp:column` (가로 3-컬럼 배치)
- **2개 이미지** → 기존 2-컬럼 블록 (이미 구현됨)
- 각 컬럼 내부: `wp:image` + `<figcaption><sup>...</sup></figcaption>` (작가명/작품명/연도/기법/소장처)
- 패턴 블록 이름이 `"이미지 2개 컬럼"`이라도 컬럼 개수는 실제 이미지 개수에 맞춤 (3개면 3컬럼)
- 컬럼 블록 앞뒤에는 `<!-- wp:block {"ref":19650} /-->` 스페이서 유지

### 5.2 사례 (3개)

https://square.antiegg.kr/portrait_of_a_lover/ — 코린트 전설 재해석 작품 3개 (루이 뒤시 / 조지프 라이트 / 코린토스의 처녀)

---

## 6. Ghost 색상 강조 (주황색 등) → `<strong>` 태그

Ghost 에디터에서 본문 텍스트의 글씨 색상을 바꿔 강조 표시한 부분의 처리.

### 6.1 변환 규칙

- 컬러 강조는 **`<strong>` 태그**로 변환 (굵은 글씨)
- WP에서는 색상을 살리지 않고 단순 bold만 적용
- 강조 범위(짧은 단어부터 전체 문장까지) 그대로 유지

### 6.2 예외 — 별개 처리

- 인용문(`<blockquote>`) 내부의 회색 텍스트(`color:#9d9d9d`)는 인용문 자체 스타일이므로 strong 변환 대상 아님
- 참고문헌 리스트의 회색 텍스트도 별개 (§7 참조)

### 6.3 사례

https://square.antiegg.kr/portrait_of_a_lover/ — `'본질'`, `'동굴의 우화'`, `상실의 두려움을 극복하고자 하는 마음...` 등 다수

---

## 7. 참고문헌 리스트 → URL/하이퍼링크 모두 삭제

글 마지막의 참고문헌 리스트 처리.

### 7.1 변환 규칙

- Ghost 원본에서 각 참고문헌 항목에 외부 URL이 걸려 있어도 **WP 변환 시 모두 제거**
- 텍스트만 plain text로 남김 (저자/매체/제목/날짜 등)
- 리스트 스타일: 회색(`#9d9d9d`) + 작은 글씨(`13px`)

### 7.2 블록 구조

```html
<!-- wp:list {"style":{"elements":{"link":{"color":{"text":"#9d9d9d"}}},"color":{"text":"#9d9d9d"},"typography":{"fontSize":"13px"}}} -->
<ul style="color:#9d9d9d;font-size:13px" class="wp-block-list has-text-color has-link-color">
  <li>저자, 매체, 제목 (날짜)</li>
  ...
</ul>
<!-- /wp:list -->
```

### 7.3 사례

https://square.antiegg.kr/portrait_of_a_lover/ — Ghost 원본 4개 참고문헌 모두 URL 첨부 (publicdomainreview, cabinetmagazine, chosun, joongboo) → WP 변환본에서 전부 제거

### 7.4 Why

- 참고문헌은 출처 표기 목적이지 사용자 유입 유도 목적이 아님 → 외부 링크 노출 시 사용자 이탈 가능성
- 본문 유입링크와 시각적/기능적으로 명확히 구분

---

## 8. 에디터 매칭 — WP 등록 에디터 표시 이름 임의 변경 금지

§ 별도 항목으로 기존 CLAUDE.md(`author-filter.ts`) 규칙을 보강:

- WP 에디터 이름·카드는 sync 과정에서 임의 변경 금지 (단일 진실 원천: WP)
- 매칭은 풀 네임 우선, 동명이인 발생 시에만 슬러그로 disambiguate

---

## 참조

- CLAUDE.md — 전체 변환 규칙·재사용 블록 ID·카테고리 매핑
- docs/automation-overview.md — 운영 흐름·기능 종합
- `html-transformer.ts` — 본문 변환 핵심 로직
- `image-handler.ts` — 이미지 다운로드/업로드/포맷 변환

<section class="slide cover">
  <div class="kicker">NAVER LOGIN API — 검수 승인 재신청</div>
  <h1>ANTIEGG 매거진<br/>네이버 블로그<br/>자동 발행 도구</h1>
  <h2>Service Introduction Deck</h2>
  <div class="meta">
    <strong>작성일</strong> &nbsp; 2026.04.21<br/>
    <strong>작성자</strong> &nbsp; ANTIEGG팀<br/>
    <strong>문의</strong> &nbsp; editor@antiegg.kr
  </div>
</section>

<section class="slide">
  <div class="slide-header">
    <div class="slide-section">CONTENTS · 목차</div>
    <div class="slide-pageno">02 / 16</div>
  </div>
  <h2 class="slide-title">문서 구성</h2>
  <p class="slide-subtitle">네이버 심사팀이 요청하신 항목을 순서대로 구성했습니다.</p>
  <div class="content">
    <div class="toc-grid">
      <div class="toc-item"><span class="toc-num">01</span><span class="toc-text">서비스 개요 및 본질</span></div>
      <div class="toc-item"><span class="toc-num">05</span><span class="toc-text">발행 전체 흐름도</span></div>
      <div class="toc-item"><span class="toc-num">02</span><span class="toc-text">검수 승인 필요 사유 (기술 증거)</span></div>
      <div class="toc-item"><span class="toc-num">06</span><span class="toc-text">발행 단계별 상세</span></div>
      <div class="toc-item"><span class="toc-num">03</span><span class="toc-text">대상 블로그 및 게시글 유형</span></div>
      <div class="toc-item"><span class="toc-num">07</span><span class="toc-text">메뉴별 UI 화면 (스크린샷)</span></div>
      <div class="toc-item"><span class="toc-num">04</span><span class="toc-text">실제 발행 포스트 예시</span></div>
      <div class="toc-item"><span class="toc-num">08</span><span class="toc-text">API 스코프 / 보안 / 운영 주체 / 요약</span></div>
    </div>
  </div>
  <div class="slide-footer"><span><strong>ANTIEGG</strong> · 네이버 API 검수 승인 재신청</span><span>editor@antiegg.kr</span></div>
</section>

<section class="slide">
  <div class="slide-header">
    <div class="slide-section">01 · 서비스 개요</div>
    <div class="slide-pageno">03 / 16</div>
  </div>
  <h2 class="slide-title">서비스 기본 정보</h2>
  <p class="slide-subtitle">ANTIEGG 내부 운영자 1~2명이 자사 네이버 블로그 1개에만 사용하는 관리자 전용 자동화 도구입니다.</p>
  <div class="content">
    <table class="two-col">
      <tr><td>서비스명</td><td>ANTIEGG 매거진 네이버 블로그 자동 예약 발행 도구</td></tr>
      <tr><td>운영 주체</td><td>ANTIEGG (사업자 등록 법인 · 프리랜서 에디터 공동체)</td></tr>
      <tr><td>서비스 성격</td><td><span class="badge">관리자 전용 내부 운영 도구</span> — 외부 사용자 없음</td></tr>
      <tr><td>대상 블로그</td><td>https://blog.naver.com/antiegg (ANTIEGG 공식 블로그 단 1개)</td></tr>
      <tr><td>발행 빈도</td><td>주 2회 — 매주 월요일·화요일 19:00 자동 예약 발행</td></tr>
      <tr><td>사용자 수</td><td>ANTIEGG 매거진 운영팀 내부 담당자 1~2명</td></tr>
      <tr><td>앱 개설자 계정</td><td>ANTIEGG 운영 담당자의 네이버 개인 계정<br/>실명 <strong>이준용</strong> · 프로필 별명 <strong>이형운</strong> (ANTIEGG 대표)</td></tr>
      <tr><td>계정 용도</td><td>ANTIEGG 법인의 공식 블로그 <code>blog.naver.com/antiegg</code> 소유·운영 전용</td></tr>
    </table>
  </div>
  <div class="slide-footer"><span><strong>ANTIEGG</strong></span><span>editor@antiegg.kr</span></div>
</section>

<section class="slide">
  <div class="slide-header">
    <div class="slide-section">01 · 서비스 본질</div>
    <div class="slide-pageno">04 / 16</div>
  </div>
  <h2 class="slide-title">계정 구조 — 모든 주체가 동일</h2>
  <p class="slide-subtitle">외부 사용자 가입·제3자 정보 수집 없이, 자사 자원만으로 운영됩니다.</p>
  <div class="content">
    <div class="callout green">
      <strong>네이버 개발자센터 앱 개설자 · blog.naver.com/antiegg 소유자 · OAuth 인증 계정이 모두 동일한 1개 계정입니다.</strong>
    </div>
    <table class="two-col">
      <tr><td>법인</td><td>ANTIEGG (사업자 등록 법인 · 대표 이준용)</td></tr>
      <tr><td>네이버 활동 계정</td><td>이준용 명의 네이버 개인 계정 (법인의 유일한 네이버 활동 계정)</td></tr>
      <tr><td>네이버 개발자센터 앱</td><td>위 계정으로 개설 (개설자 본인)</td></tr>
      <tr><td>블로그 소유</td><td>위 계정이 blog.naver.com/antiegg 소유·운영</td></tr>
      <tr><td>OAuth 인증</td><td>위 계정의 access_token · refresh_token만 로컬 서버에 저장</td></tr>
      <tr><td>외부 사용자</td><td>❌ 없음 — 서비스 가입 구조 자체가 존재하지 않음</td></tr>
      <tr><td>제3자 정보</td><td>❌ 수집·저장·공유 일체 없음</td></tr>
    </table>
  </div>
  <div class="slide-footer"><span><strong>ANTIEGG</strong></span><span>editor@antiegg.kr</span></div>
</section>

<section class="slide">
  <div class="slide-header">
    <div class="slide-section">02 · 검수 승인 필요 사유</div>
    <div class="slide-pageno">05 / 16</div>
  </div>
  <h2 class="slide-title">개발중 모드로는 기술적으로 불가능</h2>
  <p class="slide-subtitle">네이버 안내에 따라 개발중 상태에서 실제 API 호출을 검증한 결과입니다.</p>
  <div class="content">
    <h4>검증 시나리오</h4>
    <ol>
      <li>앱 개설자 계정(위 ANTIEGG 운영 계정)으로 OAuth 2.0 플로우 수행 → access_token 정상 발급</li>
      <li>발급된 토큰으로 <code>POST https://openapi.naver.com/blog/writePost.json</code> 호출</li>
    </ol>
    <h4>실제 응답</h4>
<pre><code>HTTP 404
{
  "errorMessage": "/blog/writePost.json : API does not exist.",
  "errorCode": "051"
}</code></pre>
    <div class="callout red">
      <strong>결론</strong> — writePost API 엔드포인트는 <strong>검수 승인을 받은 앱에만 활성화</strong>됩니다. 개발중 상태에서는 엔드포인트 자체가 존재하지 않아(404) 자사 블로그 발행을 위한 공식 경로가 막힌 상태입니다.
    </div>
  </div>
  <div class="slide-footer"><span><strong>ANTIEGG</strong></span><span>editor@antiegg.kr</span></div>
</section>

<section class="slide">
  <div class="slide-header">
    <div class="slide-section">02 · 승인 필요 사유 (계속)</div>
    <div class="slide-pageno">06 / 16</div>
  </div>
  <h2 class="slide-title">운영 요건이 공식 API를 요구</h2>
  <p class="slide-subtitle">자동화 · 정기성 · 안정성이 ANTIEGG 매거진 운영의 핵심입니다.</p>
  <div class="content">
    <div class="two-column">
      <div>
        <div class="col-label">지속적·정기적 호출</div>
        <ul>
          <li>매주 월·화 19:00 자동 예약 발행이 핵심 일정</li>
          <li>콘텐츠 리듬이 매거진 운영의 근간이라 수동 대체 불가</li>
          <li>서버 cron + GitHub Actions 이중 트리거로 운영 중</li>
          <li>OAuth + writePost API의 공식 안정 경로 필수</li>
        </ul>
      </div>
      <div>
        <div class="col-label">한정된 범위 — 리스크 없음</div>
        <ul>
          <li>외부 사용자 가입 없음</li>
          <li>ANTIEGG 1개 계정 · 1개 블로그 · 자체 제작 콘텐츠</li>
          <li>주 2회 · 매회 1개 포스트 (스팸·도배 요소 없음)</li>
          <li>타인 블로그 접근·수정·삭제 일체 없음</li>
        </ul>
      </div>
    </div>
    <div class="callout">
      네이버 로그인 운영원칙 · 약관 · 관계 법령상 <strong>문제 소지가 없는 자사 블로그 운영 용도</strong>이며, 공식 API 승인이 유일한 운영 경로입니다.
    </div>
  </div>
  <div class="slide-footer"><span><strong>ANTIEGG</strong></span><span>editor@antiegg.kr</span></div>
</section>

<section class="slide">
  <div class="slide-header">
    <div class="slide-section">03 · 대상 블로그 / 게시글 유형</div>
    <div class="slide-pageno">07 / 16</div>
  </div>
  <h2 class="slide-title">대상은 ANTIEGG 공식 블로그 1개뿐</h2>
  <p class="slide-subtitle">발행되는 모든 글은 ANTIEGG 자체 제작 매거진 콘텐츠입니다.</p>
  <div class="content">
    <div class="two-column">
      <div>
        <div class="col-label">대상 블로그</div>
        <table class="two-col">
          <tr><td>URL</td><td>blog.naver.com/antiegg</td></tr>
          <tr><td>블로그명</td><td>ANTIEGG 매거진</td></tr>
          <tr><td>소유자</td><td>이준용 (앱 개설자 동일)</td></tr>
          <tr><td>카테고리</td><td>문화예술 큐레이션 · 아티스트 인터뷰 · 디자인 · 컬쳐</td></tr>
        </table>
      </div>
      <div>
        <div class="col-label">게시글 구성 요소</div>
        <table class="two-col">
          <tr><td>제목</td><td>WordPress 원문과 동일</td></tr>
          <tr><td>본문 서두</td><td>원문 도입부 300~500자 (첫 <code>&lt;hr&gt;</code>까지)</td></tr>
          <tr><td>대표 이미지</td><td>WP 동기화된 이미지</td></tr>
          <tr><td>본문 말미</td><td>"원문 이어 읽기" CTA + antiegg.kr OG 카드</td></tr>
          <tr><td>하단</td><td>ANTIEGG 브랜드 소개 + 구독 유도</td></tr>
          <tr><td>태그</td><td>카테고리 + 테마 + 키워드 자동 생성</td></tr>
        </table>
      </div>
    </div>
    <div class="callout green">
      모든 게시글은 <strong>antiegg.kr 원문으로의 유입을 유도하는 티저 형태</strong>이며, ANTIEGG 매거진 에디터가 직접 작성한 오리지널 콘텐츠입니다.
    </div>
  </div>
  <div class="slide-footer"><span><strong>ANTIEGG</strong></span><span>editor@antiegg.kr</span></div>
</section>

<section class="slide">
  <div class="slide-header">
    <div class="slide-section">04 · 실제 발행 예시</div>
    <div class="slide-pageno">08 / 16</div>
  </div>
  <h2 class="slide-title">현재 수동 운영 중인 실제 포스트</h2>
  <p class="slide-subtitle">자동화 후에도 아래와 동일한 포맷·구성으로 발행됩니다.</p>
  <div class="content">
    <table>
      <tr><th>카테고리</th><th>발행 URL</th><th>비고</th></tr>
      <tr>
        <td><span class="badge">큐레이션</span></td>
        <td>https://blog.naver.com/antiegg/224253806102</td>
        <td>주중 정규 발행 아티클 샘플</td>
      </tr>
      <tr>
        <td><span class="badge">그레이</span></td>
        <td>https://blog.naver.com/antiegg/224253777276</td>
        <td>주간 마감 아티클 샘플</td>
      </tr>
    </table>
    <h4>발행 이력</h4>
    <ul>
      <li>누적 발행 콘텐츠 <strong>1,500+ 건</strong> (antiegg.kr 원문 기준, 네이버 블로그는 일부 이관)</li>
      <li>월간 웹사이트 조회수 <strong>80만+ 회</strong>, 방문자 누적 <strong>80만+ 명</strong></li>
      <li>매주 금요일 WordPress 본발행 → 다음 주 월/화 네이버 재발행 리듬 확립</li>
    </ul>
    <div class="callout">
      위 포스트는 현재 <strong>수동 복사·붙여넣기</strong>로 운영 중입니다. 이 수동 작업을 공식 API로 자동화하는 것이 본 도구의 핵심 목적입니다.
    </div>
  </div>
  <div class="slide-footer"><span><strong>ANTIEGG</strong></span><span>editor@antiegg.kr</span></div>
</section>

<section class="slide">
  <div class="slide-header">
    <div class="slide-section">05 · 전체 데이터 흐름</div>
    <div class="slide-pageno">09 / 16</div>
  </div>
  <h2 class="slide-title">발행 전체 파이프라인</h2>
  <p class="slide-subtitle">에디터 원고 작성부터 네이버 블로그 예약 발행까지 단일 자동화 라인.</p>
  <div class="content">
    <div class="flow">
      <div class="flow-step"><strong>SOURCE</strong>Ghost CMS · square.antiegg.kr<span class="small">ANTIEGG 에디터 원고 작성</span></div>
      <div class="flow-arrow">↓ <small>매주 금요일 09:00 자동 동기화</small></div>
      <div class="flow-step"><strong>PUBLISHING</strong>WordPress · antiegg.kr<span class="small">매거진 본발행 플랫폼</span></div>
      <div class="flow-arrow">↓ <small>다음 주 월/화 발행분 fetch</small></div>
      <div class="flow-step highlight"><strong>BRIDGE</strong>본 도구 (ANTIEGG 내부 서버)<span class="small">WP 조회 · 포맷 변환 · OAuth 토큰 관리</span></div>
      <div class="flow-arrow">↓ <small>월/화 19:00 자동 실행 (cron)</small></div>
      <div class="flow-step"><strong>NAVER API</strong><code>POST /blog/writePost.json</code><span class="small">검수 승인 필요 엔드포인트</span></div>
      <div class="flow-arrow">↓ <small>예약 발행 완료</small></div>
      <div class="flow-step"><strong>DESTINATION</strong>blog.naver.com/antiegg<span class="small">ANTIEGG 공식 블로그</span></div>
    </div>
  </div>
  <div class="slide-footer"><span><strong>ANTIEGG</strong></span><span>editor@antiegg.kr</span></div>
</section>

<section class="slide">
  <div class="slide-header">
    <div class="slide-section">05 · 발행 단계별 상세</div>
    <div class="slide-pageno">10 / 16</div>
  </div>
  <h2 class="slide-title">8단계 자동 발행 프로세스</h2>
  <p class="slide-subtitle">모든 단계가 ANTIEGG 내부 서버에서 자동 실행됩니다.</p>
  <div class="content">
    <table>
      <tr><th>#</th><th>단계</th><th>내용</th></tr>
      <tr><td>1</td><td>원고 수집</td><td>Ghost CMS에 ANTIEGG 에디터가 원고 작성</td></tr>
      <tr><td>2</td><td>WP 동기화</td><td>매주 금요일 09:00 Ghost → WordPress 자동 동기화 (예약 발행 상태)</td></tr>
      <tr><td>3</td><td>주간 큐레이션</td><td>다음 주 월·화 발행 아티클 자동 분배</td></tr>
      <tr><td>4</td><td>포맷 변환</td><td>WordPress HTML → 네이버 SE3 에디터 호환 마크업 변환</td></tr>
      <tr><td>5</td><td>OAuth 인증</td><td>ANTIEGG 운영 계정 access_token 로드 (만료 60초 전 자동 refresh)</td></tr>
      <tr><td>6</td><td>예약 발행 요청</td><td><code>POST /blog/writePost.json</code> — 제목 · 본문 · 카테고리 · 태그 전송</td></tr>
      <tr><td>7</td><td>발행 완료</td><td>월/화 19:00 예약으로 blog.naver.com/antiegg에 등록</td></tr>
      <tr><td>8</td><td>이력 저장</td><td>logNo · postUrl 내부 상태 파일에 기록 → 중복 발행 방지</td></tr>
    </table>
  </div>
  <div class="slide-footer"><span><strong>ANTIEGG</strong></span><span>editor@antiegg.kr</span></div>
</section>

<section class="slide">
  <div class="slide-header">
    <div class="slide-section">06 · 메뉴 1 · 로그인 연결</div>
    <div class="slide-pageno">11 / 16</div>
  </div>
  <h2 class="slide-title">메뉴 1 — 네이버 로그인 연결 페이지</h2>
  <p class="slide-subtitle"><code>http://localhost:3000/naver-auth.html</code> · ANTIEGG 운영 계정으로 OAuth 연결</p>
  <div class="content">
    <div class="screen-layout">
      <div class="info">
        <h3>화면 구성</h3>
        <ul>
          <li><strong>연결 상태 배지</strong> — 녹색(연결됨) · 주황(미연결)</li>
          <li><strong>"네이버로 로그인"</strong> — 네이버 공식 인증 페이지로 302 이동</li>
          <li><strong>Access Token 잔여 시간</strong> — 만료 임박 알림</li>
          <li><strong>최초 연결 시각</strong> — 토큰 발급 이력</li>
          <li><strong>재연결 버튼</strong> — 수동 토큰 재발급</li>
        </ul>
        <h3>동작 플로우</h3>
        <ol>
          <li>버튼 클릭 → <code>/api/naver/auth/start</code></li>
          <li>네이버 로그인 + 권한 동의</li>
          <li>콜백 수신 → 토큰 교환</li>
          <li><code>.naver-tokens.json</code> 저장 (git 제외)</li>
        </ol>
      </div>
      <img src="screenshots/screenshot-01-naver-auth.png" alt="네이버 로그인 연결 페이지" />
    </div>
  </div>
  <div class="slide-footer"><span><strong>ANTIEGG</strong></span><span>editor@antiegg.kr</span></div>
</section>

<section class="slide">
  <div class="slide-header">
    <div class="slide-section">06 · 메뉴 2 · 주간 대시보드</div>
    <div class="slide-pageno">12 / 16</div>
  </div>
  <h2 class="slide-title">메뉴 2 — 주간 발행 대시보드</h2>
  <p class="slide-subtitle">다가오는 주의 월·화 발행 아티클을 한눈에 확인·관리</p>
  <div class="content">
    <div class="screen-layout">
      <div class="info">
        <h3>화면 구성</h3>
        <ul>
          <li><strong>좌측 패널</strong> — 월/화요일 그룹별 아티클 카드 리스트<br/><span class="small">제목 · 카테고리 · 에디터명 · 발행 시각</span></li>
          <li><strong>우측 패널</strong> — 선택 아티클의 네이버 포맷 미리보기</li>
          <li><strong>예약 배지</strong> — 예약 완료된 아티클은 녹색 테두리 + "✅ 자동 예약됨" 표시</li>
        </ul>
        <h3>기본 주 표시 로직</h3>
        <ul>
          <li>월·화요일에 열면 이번 주</li>
          <li>수~일요일에 열면 다음 주</li>
          <li>지난 주 아티클 노출 방지 (<code>getCurrentKstWeek</code>)</li>
        </ul>
      </div>
      <img src="screenshots/screenshot-02-weekly-dashboard.png" alt="주간 발행 대시보드" />
    </div>
  </div>
  <div class="slide-footer"><span><strong>ANTIEGG</strong></span><span>editor@antiegg.kr</span></div>
</section>

<section class="slide">
  <div class="slide-header">
    <div class="slide-section">06 · 메뉴 3 · 포맷 미리보기</div>
    <div class="slide-pageno">13 / 16</div>
  </div>
  <h2 class="slide-title">메뉴 3 — 아티클 포맷 미리보기 및 발행</h2>
  <p class="slide-subtitle">발행 직전 최종 확인 · 수동 트리거 가능</p>
  <div class="content">
    <div class="screen-layout">
      <div class="info">
        <h3>화면 구성</h3>
        <ul>
          <li><strong>제목 · 대표 이미지 · WP 원문 URL</strong> 확인</li>
          <li><strong>자동 생성 태그</strong> — 카테고리 + 테마 + 키워드</li>
          <li><strong>본문 미리보기</strong> — 네이버 SE3 호환 마크업 렌더</li>
          <li><strong>"본문 복사" 버튼</strong> — 수동 검수용</li>
        </ul>
        <h3>발행 모드</h3>
        <ul>
          <li><strong>예약 발행 (기본)</strong> — 월·화 19:00 고정</li>
          <li><strong>즉시 발행 (수동 운영)</strong> — 관리자 수동 트리거</li>
        </ul>
        <p class="small">발행 버튼 클릭 시 <code>POST /blog/writePost.json</code> 호출 (승인 후 활성화).</p>
      </div>
      <img src="screenshots/screenshot-03-preview-publish.png" alt="아티클 포맷 미리보기" />
    </div>
  </div>
  <div class="slide-footer"><span><strong>ANTIEGG</strong></span><span>editor@antiegg.kr</span></div>
</section>

<section class="slide">
  <div class="slide-header">
    <div class="slide-section">06 · 메뉴 4 · 예약 상태</div>
    <div class="slide-pageno">14 / 16</div>
  </div>
  <h2 class="slide-title">메뉴 4 — 예약 상태 배지 UI</h2>
  <p class="slide-subtitle">중복 발행 방지 · 자동 예약 현황 시각화 (동일 UX가 네이버 탭에도 적용 예정)</p>
  <div class="content">
    <div class="screen-layout">
      <div class="info">
        <h3>화면 구성</h3>
        <ul>
          <li>예약 완료 아티클 카드: <strong>녹색 테두리</strong></li>
          <li>예약 정보 배지: <strong>"✅ 자동 예약됨 · MM/DD HH:mm 발행"</strong></li>
          <li>클릭 시 발행 안내 패널 (prepare 중복 방지)</li>
        </ul>
        <h3>중복 방지 로직</h3>
        <ul>
          <li>상태 파일 <code>.naver-publish-state.json</code>에 매핑 저장<br/><span class="small">WP 원문 ID · 네이버 logNo · 예약 시각</span></li>
          <li>이미 예약된 WP ID는 재예약 스킵</li>
        </ul>
        <p class="small">※ 현재 캡처는 동일 도구의 <strong>브런치 탭</strong> 구현 상태이며, 네이버 검수 승인 후 네이버 탭에도 동일한 UX 패턴을 적용합니다.</p>
      </div>
      <img src="screenshots/screenshot-04-reserved-list.png" alt="예약 상태 배지 UI" />
    </div>
  </div>
  <div class="slide-footer"><span><strong>ANTIEGG</strong></span><span>editor@antiegg.kr</span></div>
</section>

<section class="slide">
  <div class="slide-header">
    <div class="slide-section">07 · API 스코프 / 보안</div>
    <div class="slide-pageno">15 / 16</div>
  </div>
  <h2 class="slide-title">사용하는 API · 처리하는 정보</h2>
  <p class="slide-subtitle">자사 블로그 글쓰기에 필요한 최소 스코프만 사용합니다.</p>
  <div class="content">
    <div class="two-column">
      <div>
        <div class="col-label">사용 API 스코프</div>
        <table>
          <tr><th>용도</th><th>엔드포인트</th></tr>
          <tr><td>로그인</td><td><code>/oauth2.0/authorize</code></td></tr>
          <tr><td>토큰 교환/갱신</td><td><code>/oauth2.0/token</code></td></tr>
          <tr><td>프로필 조회</td><td><code>/v1/nid/me</code></td></tr>
          <tr><td>블로그 글쓰기</td><td><code>/blog/writePost.json</code> <span class="badge">승인 필요</span></td></tr>
        </table>
        <p class="small"><strong>사용하지 않는 스코프</strong>: 카페 · 메일 · 캘린더 · 쇼핑 · 블로그 수정/삭제 · 타인 블로그 접근</p>
      </div>
      <div>
        <div class="col-label">개인정보 · 보안</div>
        <table class="two-col">
          <tr><td>저장 정보</td><td>ANTIEGG 운영 계정의 access_token · refresh_token만</td></tr>
          <tr><td>저장 위치</td><td><code>.naver-tokens.json</code> (로컬 서버 · git 제외)</td></tr>
          <tr><td>외부 사용자 정보</td><td>❌ 수집 없음 (사용자 가입 구조 부재)</td></tr>
          <tr><td>제3자 공유</td><td>❌ 없음</td></tr>
          <tr><td>토큰 보호</td><td>만료 60초 전 자동 refresh, 로컬 외부 전송 없음</td></tr>
          <tr><td>스팸·도배</td><td>❌ 주 2회 · 자체 제작 매거진만</td></tr>
        </table>
      </div>
    </div>
  </div>
  <div class="slide-footer"><span><strong>ANTIEGG</strong></span><span>editor@antiegg.kr</span></div>
</section>

<section class="slide">
  <div class="slide-header">
    <div class="slide-section">08 · 운영 주체 / 핵심 요약</div>
    <div class="slide-pageno">16 / 16</div>
  </div>
  <h2 class="slide-title">운영 주체 정보 및 핵심 요약</h2>
  <p class="slide-subtitle">검수 팀이 빠르게 확인하실 수 있도록 핵심 항목을 정리했습니다.</p>
  <div class="content">
    <div class="two-column">
      <div>
        <div class="col-label">운영 주체</div>
        <table class="two-col">
          <tr><td>법인</td><td>ANTIEGG (사업자 등록)</td></tr>
          <tr><td>대표</td><td>이준용 (활동명 이형운)</td></tr>
          <tr><td>웹사이트</td><td>antiegg.kr</td></tr>
          <tr><td>네이버 블로그</td><td>blog.naver.com/antiegg</td></tr>
          <tr><td>서비스 이력</td><td>2020~ · 현재 ANTIEGG 3.0</td></tr>
          <tr><td>팀 구성</td><td>Product · Content · Creative · Business (약 60명)</td></tr>
          <tr><td>발행 콘텐츠</td><td>누적 1,500+ 건 · 월간 조회 80만+</td></tr>
          <tr><td>문의</td><td>editor@antiegg.kr</td></tr>
        </table>
      </div>
      <div>
        <div class="col-label">핵심 확인 사항</div>
        <table class="summary-table">
          <tr><td class="reason">외부 사용자가 가입·이용하는 서비스인가?</td><td>❌ 아니오</td></tr>
          <tr><td class="reason">개발중 모드로 운영 가능한가?</td><td>❌ 불가 (404)</td></tr>
          <tr><td class="reason">타인 블로그에 접근하는가?</td><td>❌ 아니오</td></tr>
          <tr><td class="reason">사용자 정보를 수집하는가?</td><td>❌ 없음</td></tr>
          <tr><td class="reason">스팸·도배 우려가 있는가?</td><td>❌ 없음</td></tr>
          <tr><td class="reason">승인이 필요한 이유는?</td><td>✅ writePost API 정식 사용</td></tr>
        </table>
      </div>
    </div>
    <div class="callout red">
      ANTIEGG는 자사 매거진 콘텐츠를 자사 블로그에 안정적으로 재발행하기 위한 <strong>공식 API 승인</strong>을 요청드립니다. 추가 확인이 필요한 사항은 <strong>editor@antiegg.kr</strong>로 연락주시면 즉시 제공드리겠습니다. 감사합니다.
    </div>
  </div>
</section>

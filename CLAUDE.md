# Zonemate

ADHD 개발자를 위한 집중 관리 데스크톱 앱. 웹캠 없이 마우스·키보드·앱 활동 신호로
집중 상태를 파악하고, "이탈(underfocus)"과 "과몰입(overfocus)" 둘 다 다룬다.
위로/칭찬이 아니라 **팩트 기반 인식**을 지향한다(예: "집중하세요" 대신 "22분째 다른 창이에요").

## 구조 (모노레포)
- `frontend/` — React + Vite. 챗봇 플래너("John"), 원형 시간표(DayWheel), 애플캘린더 스타일 그리드, 집중 대시보드.
- `backend/` — Express + **node:sqlite**(better-sqlite3 아님) + Gemini(`@google/genai`). JWT httpOnly 쿠키 인증(구글/카카오 OAuth).
- `electron/` — 데스크톱 래퍼. 백엔드+프론트를 한 앱으로 감싸고, 트레이 상주 + 집중 세션 상태머신 + 플로팅 알림.
- `os-tracker/` — 전역 마우스/키보드 캡처(`@mukea/uiohook-napi`) → backend `/api/metrics`로 POST.
- `browser-extension/` — 브라우저 활동 신호 수집(보조).

## 개발 실행
- 통합(권장): `cd electron && npm start` — 백엔드(:4000)+Vite(:5173)+창을 한 번에. 이미 떠 있는 포트는 재사용.
- 개별: `cd backend && npm run dev`(:4000) / `cd frontend && npm run dev`(:5173, `/api`는 :4000으로 프록시).
- 백엔드 테스트: `cd backend && npm run test:focus`(집중 엔진 synthetic 테스트).

## 빌드 / 배포 / 자동 업데이트
- 로컬 빌드: `cd electron && npm run make:mac`(→`release/`에 .dmg+.zip) / 윈도우 PC에서 `npm run make:windows`(→Setup.exe).
- CI 릴리스: `electron/package.json` 버전 올리고 `git tag vX.Y.Z && git push origin vX.Y.Z` → `.github/workflows/release.yml`이 mac(universal)+win(x64) 빌드해 GitHub Release 자동 공개 → 설치된 앱이 `update.electronjs.org`로 자동 업데이트. **절차는 `/release` 스킬 참고.**
- **Windows 자동 업데이트는 미서명도 동작. macOS는 Apple Developer ID 코드서명+노터라이즈가 있어야만 동작**(없으면 no-op).

## 아키텍처 함정 (겪은 것들 — 다시 밟지 말 것)
- **node:sqlite는 Electron 43(내장 Node 24)에서 플래그 없이 동작**한다. 패키지 백엔드는 `process.execPath`+`ELECTRON_RUN_AS_NODE=1`로 뜬다. (옛 주석의 "내장 Node엔 sqlite 없음"은 더 이상 사실 아님.)
- **패키지 실행 시 백엔드가 프론트 정적 빌드를 같은 오리진(:4000)에서 서빙**한다(`FRONTEND_DIST_DIR` 설정 시 `express.static`+SPA폴백, 단 `/api` 제외). 개발 땐 Vite가 담당하므로 미설정.
- 프론트 API 호출은 **상대경로 `/api/...`** 만 쓴다(하드코딩 오리진 금지) — 같은 오리진 패키징이 이걸로 성립.
- LLM: `gemini-flash-latest`(Google 관리 별칭). `responseSchema`로 구조화 출력 강제. API 키 없으면 그 기능만 비활성(지연 초기화 — 서버 전체가 죽지 않게).
- forge outDir은 ASCII 임시경로(프로젝트 경로에 한글 '몰입캠프'가 있어 rcedit/빌드가 깨질 수 있음).
- 아이콘 = "집중냥"(고양이). 앱 아이콘/메뉴바 템플릿/John 아바타(`BotAvatar.jsx`)가 **모두 동일 SVG 도형**. 재생성은 `@resvg/resvg-js`→PNG→`iconutil`.

## 디자인 시스템
"앰버 인광 계기판" — 시그널(집중, 앰버 `--signal`) vs 노이즈(이탈, 블루그레이). urgent는 마감임박에만. **라이트모드 기본**. 데이터=모노스페이스, 문장=산세리프. 토큰은 `frontend/src/styles/tokens.css`.

## 커밋 규칙
- `feat:`/`fix:`/`docs:`/`ci:` 접두사, 200~300줄 단위로 끊어서 커밋(몰입캠프 커밋 평가 기준). `main` 직접 push 허용.

---
name: release
description: Zonemate 데스크톱 앱을 새 버전으로 릴리스한다. electron/package.json 버전 올림 → git 태그 push → GitHub Actions가 mac/win 빌드해 Release 자동 공개 → 설치된 앱 자동 업데이트. "릴리스", "배포", "새 버전 내보내기", "release", "업데이트 배포" 요청 시 사용.
---

# Zonemate 릴리스

새 버전을 내보내면 설치된 앱들이 **재설치 없이** GitHub Release에서 자동 업데이트된다.
소스 코드 push(main)만으로는 설치된 앱이 절대 안 바뀐다 — 아래 절차가 필요하다.

## 절차

1. **릴리스에 포함할 변경이 `main`에 커밋·push 되어 있는지 확인.**
   ```
   git status   # 깨끗해야 함
   git log --oneline -5
   ```

2. **버전 올리기** — `electron/package.json`의 `"version"`을 SemVer로 올린다(예: `0.1.2` → `0.1.3`).
   버그픽스=patch, 기능추가=minor. 태그와 버전은 **반드시 일치**시킨다.

3. **커밋 + push.**
   ```
   git add electron/package.json
   git commit -m "chore: v0.1.3"
   git push
   ```

4. **태그 생성 + push** (이게 CI 트리거).
   ```
   git tag v0.1.3
   git push origin v0.1.3
   ```

5. **CI 확인** — GitHub Actions "Release" 워크플로가 macOS(universal)+Windows(x64)를 빌드해
   GitHub Release로 올린다. `forge.config.js`의 publisher가 `draft:false`면 **자동 공개**,
   `draft:true`면 Releases에서 초안을 수동 **Publish**해야 공개된다.
   - 공개(non-draft)된 순간부터 설치된 앱이 `update.electronjs.org`로 자동 업데이트(실행 중 6시간 주기 체크 또는 다음 실행 시).

## 주의
- **자동 업데이트는 설치된 앱 안에 업데이터(`update-electron-app`)가 들어 있어야 동작**한다. 그 코드가 없던 옛 빌드를 쓰는 사용자는 새 버전을 **한 번은 수동 설치**해야 이후부터 자동 업데이트된다.
- **Windows**(Squirrel): 미서명도 자동 업데이트 OK.
- **macOS**(Squirrel.Mac): **Apple Developer ID 코드서명+노터라이즈가 있어야만** 자동 업데이트 동작. 미서명이면 no-op → 맥 사용자는 새 `.dmg`를 재다운로드. 서명을 붙이려면 `.github/workflows/release.yml`에 `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` 시크릿 + `forge.config.js` `packagerConfig`에 `osxSign`/`osxNotarize` 추가.
- 로컬에서 바이너리만 뽑으려면: `cd electron && npm run make:mac`(→`release/`) / 윈도우 PC에서 `npm run make:windows`.

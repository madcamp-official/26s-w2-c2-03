# Windows 수집 파이프라인 검증

## 1. 의존성 및 합성 로직 검사

```powershell
cd backend
npm.cmd run test:focus

cd ..\os-tracker
npm.cmd run check
```

이 단계는 실제 키보드/마우스를 후킹하지 않는다. 이벤트 분류와 어댑터 문법만
검증한다.

## 2. 백엔드 실행

```powershell
cd backend
npm.cmd run dev
```

다른 터미널에서 다음 명령으로 health API를 확인한다.

```powershell
Invoke-RestMethod http://localhost:4000/api/health
```

## 3. 자동 Windows 진단

백엔드가 실행 중인 상태에서 새 터미널을 연다.

```powershell
cd os-tracker
npm.cmd install
npm.cmd run diagnose:windows
```

이 명령은 입력 후킹을 시작하지 않고 다음 항목을 확인한다.

1. `@mukea/uiohook-napi` 네이티브 바이너리 로드
2. `get-windows`의 실제 활성 앱·창 제목·PID 조회
3. `/api/health` 연결
4. 합성 이벤트를 `/api/metrics`로 전송
5. `/api/metrics/focus-state`에 세션이 생성됐는지 확인

## 4. 실제 OS 이벤트 확인

```powershell
cd os-tracker
$env:METRICS_CLIENT_ID='my-windows-pc'
npm.cmd start
```

다음 행동을 순서대로 한다.

1. VS Code에서 키를 몇 번 누른다.
2. 다른 앱으로 전환한다.
3. Chrome을 열고 GitHub와 YouTube 탭을 번갈아 선택한다.
4. 5초 후 백엔드 터미널에 `[키보드]`, `[활성 창]`, `[브라우저 탭]` 로그가
   표시되는지 확인한다.

PowerShell에서 현재 focus state를 확인한다.

```powershell
Invoke-RestMethod http://localhost:4000/api/metrics/focus-state |
  ConvertTo-Json -Depth 8
```

## 5. 브라우저 확장 확인

1. Chrome에서 `chrome://extensions`를 연다.
2. 개발자 모드를 켠다.
3. `압축해제된 확장 프로그램을 로드`에서 `browser-extension`을 선택한다.
4. 확장 카드의 `서비스 워커` 링크를 눌러 콘솔을 연다.
5. GitHub와 YouTube 사이를 이동한다.
6. 서비스 워커 콘솔에 전송 오류가 없는지 확인한다.
7. 백엔드의 `[브라우저 탭]` 로그와 focus-state의 `currentWindow.url`을 확인한다.

OS tracker와 확장의 `clientId` 기본값은 모두 `local-device`다. tracker에서
`METRICS_CLIENT_ID`를 바꾼 경우 확장 서비스 워커 콘솔에서 아래 명령으로 같은
값을 지정한다.

```js
chrome.storage.local.set({ clientId: 'my-windows-pc' })
```

## 흔한 실패 원인

- `MODULE_NOT_FOUND`: `os-tracker`에서 `npm.cmd install`을 다시 실행한다.
- 네이티브 모듈 로드 실패: Node 아키텍처가 Windows와 맞는지 확인한다
  (`node -p "process.arch"`). 일반적인 64비트 Windows는 `x64`여야 한다.
- 관리자 프로그램의 입력만 누락: PowerShell을 관리자 권한으로 실행해 비교한다.
- 활성 창은 보이지만 URL이 없음: 브라우저 확장이 설치·활성화됐는지 확인한다.
- 확장 전송 실패: 백엔드가 4000번 포트에서 실행 중인지 확인한다.
- 상태가 계속 `neutral`: 3분 이상 입력이 없으면 idle 보호 로직이 우선한다.

# iOS 설치 매뉴얼 — 내 Mac에서 내 iPhone/iPad에 Zonemate 깔기

`ios-focus-shield` 브랜치의 Zonemate(앱 차단 포함)를 **자기 Mac에서 자기 기기에**
직접 빌드해서 설치하는 방법. 서버(Metro) 없이 단독 실행되는 Release 빌드를 만든다.

> ⚠️ **가장 중요한 팁 먼저:** 저장소를 **경로에 한글/공백이 없는 위치**에 두세요.
> (예: `~/dev/26s-w2-c2-03` ✅ / `~/문서/몰입캠프/...` ❌)
> 한글 경로에선 CocoaPods·Metro가 깨져서 우리가 크게 고생했습니다. ASCII 경로면 그 문제 대부분이 사라집니다.

---

## 0. 준비물 요약
- **macOS + Xcode**(App Store에서 설치, 최초 1회 실행해 컴포넌트 설치까지 완료)
- **Apple 계정** — 앱 차단(Family Controls)까지 쓰려면 **유료 Apple Developer Program($99/년) 계정**이 필요.
  무료 계정으론 서명 단계에서 막힌다(뒤 "무료 계정" 항목 참고).
- **Homebrew, Node 22, CocoaPods, Watchman, git**
- 설치할 **iPhone/iPad**(개발자 모드 켤 수 있어야 함)

---

## 1. 개발 도구 설치
```sh
# Xcode Command Line Tools
xcode-select --install

# Homebrew (없으면)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node 22 + CocoaPods + Watchman
brew install node@22 cocoapods watchman
```
Xcode를 **한 번 실행**해서 라이선스 동의 + 추가 컴포넌트 설치를 끝내둔다.

---

## 2. 저장소 받기 (ASCII 경로에!)
```sh
mkdir -p ~/dev && cd ~/dev
git clone <레포 URL> 26s-w2-c2-03
cd 26s-w2-c2-03
git checkout ios-focus-shield
cd mobile
```

## 3. JS 의존성 설치
```sh
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"   # 이 세션 동안 node 22 사용
npm install
```

## 4. 네이티브 프로젝트 생성 + Pod 설치
`ios/` 폴더는 git에 안 올라가므로(gitignore) 직접 생성한다.
```sh
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
npx expo prebuild --clean --platform ios
cd ios && pod install && cd ..
```
`ios/.xcode.env.local` 파일을 만들어 Xcode 빌드가 node 22를 쓰게 한다:
```sh
echo 'export NODE_BINARY=/opt/homebrew/opt/node@22/bin/node' > ios/.xcode.env.local
```

---

## 5. Apple 계정 / 팀 설정  ⭐ 여기가 핵심
1. **Xcode → Settings → Accounts** 에서 본인 Apple ID로 로그인.
2. 유료 계정이면 [developer.apple.com/account](https://developer.apple.com/account) 에서
   **최신 Program License Agreement(약관)에 동의**해 둔다(안 하면 서명이 막힘).
3. **팀 ID 확인**:
   ```sh
   defaults read com.apple.dt.Xcode IDEProvisioningTeams
   ```
   `teamID`(10자리, 예 `ABCDE12345`)를 메모. `isFreeProvisioningTeam = 0` 이어야 유료.
4. **번들 ID를 본인만의 고유값으로 변경** — 번들 ID는 전 세계에서 유일해야 해서
   `io.zonemate.mobile.jimin`을 그대로 못 쓴다. `mobile/app.json`에서:
   ```json
   "ios": { "bundleIdentifier": "io.zonemate.mobile.<본인이름>" }
   ```
   (변경 후 `npx expo prebuild --clean --platform ios && cd ios && pod install && cd ..` 다시)

---

## 6. 기기 준비
1. iPhone/iPad를 케이블로 Mac에 연결 → **잠금 해제** → **"이 컴퓨터를 신뢰"** 누르기.
2. 기기에서 **설정 → 개인정보 보호 및 보안 → 개발자 모드** 켜기(재부팅).
3. 설치하는 동안 **화면이 잠기지 않게** 둔다(잠기면 "unavailable"로 빠져 실패).

기기 UUID 확인:
```sh
xcrun devicectl list devices        # 연결된 기기의 identifier 확인
```

---

## 7. 빌드 → 설치 → 실행

### 방법 A: expo 명령 (가장 간단, 권장)
```sh
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npx expo run:ios --device --configuration Release
```
연결된 기기를 고르라고 나오면 본인 기기 선택. 처음이면 팀도 물어본다.
→ 자동으로 빌드·서명·설치·실행까지 된다.

### 방법 B: xcodebuild 직접 (방법 A가 멈추거나 실패할 때)
아래 플래그들은 우리가 겪은 문제를 피하려고 넣은 것(트러블슈팅 참고).
```sh
cd ios
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PATH="/opt/homebrew/opt/node@22/bin:$PATH"

xcodebuild -workspace Zonemate.xcworkspace -scheme Zonemate -configuration Release \
  -destination 'platform=iOS,id=<기기UUID>' \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  DEVELOPMENT_TEAM=<본인팀ID> \
  PRODUCT_BUNDLE_IDENTIFIER=io.zonemate.mobile.<본인이름> \
  CODE_SIGN_STYLE=Automatic \
  COMPILER_INDEX_STORE_ENABLE=NO \
  SWIFT_OPTIMIZATION_LEVEL='-Onone' \
  ENTRY_FILE=index.js \
  build

# 빌드 성공 후 설치 + 실행
APP=~/Library/Developer/Xcode/DerivedData/Zonemate-*/Build/Products/Release-iphoneos/Zonemate.app
xcrun devicectl device install app --device <기기UUID> $APP
xcrun devicectl device process launch --device <기기UUID> io.zonemate.mobile.<본인이름>
```

첫 실행 시 기기에 **"신뢰되지 않은 개발자"**가 뜨면:
설정 → 일반 → **VPN 및 기기 관리** → 본인 개발자 프로파일 → **신뢰**.

설치 후 **앱 차단 쓰려면**: 앱 열고 집중 탭 → "차단할 앱 고르기" → 스크린타임 권한 허용 → 앱 선택(기기마다 1회).

---

## 8. 트러블슈팅 (우리가 실제로 겪은 것들)
| 증상 | 원인 / 해결 |
|---|---|
| `pod install`이 인코딩 에러(Unicode Normalization) | 경로에 한글 → `export LANG=en_US.UTF-8` (근본해결: ASCII 경로) |
| 번들 실패 `Unable to resolve module index.js` | 경로 한글 → 빌드에 `ENTRY_FILE=index.js` 추가(상대경로) |
| Release 빌드가 **ExpoModulesCore에서 멈춤**(0% CPU) | Swift 옵티마이저 데드락 → `SWIFT_OPTIMIZATION_LEVEL=-Onone` |
| 빌드가 시작하자마자 멈춤 | **Xcode 앱(GUI)이 같은 프로젝트를 열고 있음** → Xcode 종료 후 CLI 빌드 |
| `getConfig`/번들러가 조용히 멈춤 | node_modules 손상 → `rm -rf node_modules && npm install` |
| codegen 단계에서 멈춤(Debug 후 Release) | DerivedData 충돌 → `rm -rf ~/Library/Developer/Xcode/DerivedData/Zonemate-*` 후 재빌드 |
| `Failed Registering Bundle Identifier ... not available` | 번들 ID가 다른 팀에 등록됨 → **본인 고유 번들 ID로 변경** |
| `PLA Update available` | 개발자 계정에서 **최신 약관 동의** 필요 |
| `Personal team ... do not support Family Controls` | 무료 계정이라 앱 차단 서명 불가 → **유료 계정** 필요 |
| `Unable to find a destination` / 설치 시 `unavailable` | 기기가 잠김/절전 → **화면 켜고 잠금 해제** 후 재시도 |

---

## 9. 유료 계정이 없다면
- **앱 차단(Family Controls)은 유료 팀에서만** 서명된다. 무료 계정으론 이 브랜치를 못 깐다.
- 대안 1: 앱 차단만 끄고 나머지 앱을 무료 계정으로 빌드 —
  `mobile/modules/focus-shield/index.ts`의 `SHIELD_ENABLED = false`,
  `mobile/app.json`의 `ios.entitlements`에서 `com.apple.developer.family-controls` 제거 후 prebuild.
- 대안 2: 그냥 데모만 볼 거면 **`main` 브랜치 + Expo Go** — 설치 없이
  `npx expo start` → Expo Go 앱으로 QR 스캔(앱 차단은 Expo Go에서 동작 안 함).

---
문의: 김민재

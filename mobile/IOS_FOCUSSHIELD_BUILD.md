# iOS FocusShield(앱 차단) 로컬 빌드 메모

`ios-focus-shield` 브랜치에서 Family Controls 앱 차단이 켜진(SHIELD_ENABLED=true) 빌드를
로컬에서 실기기에 올리는 방법. 유료 Apple Developer 팀이 있어야 서명된다.

## 사전 준비
- Xcode 빌드 스크립트가 node@22를 쓰도록 `ios/.xcode.env.local`에
  `export NODE_BINARY=/opt/homebrew/opt/node@22/bin/node` (gitignore됨, 각자 생성)
- CocoaPods/Metro가 경로의 한글을 처리하도록 항상 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`
- 최초 1회: `npx expo prebuild --clean --platform ios` → `cd ios && pod install`

## 서명 빌드 → 설치 → 실행
```sh
cd mobile/ios
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PATH="/opt/homebrew/opt/node@22/bin:$PATH"

xcodebuild -workspace Zonemate.xcworkspace -scheme Zonemate -configuration Release \
  -destination 'platform=iOS,id=<기기UUID>' \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  DEVELOPMENT_TEAM=<팀ID> \
  PRODUCT_BUNDLE_IDENTIFIER=<팀마다 고유한 값> \
  CODE_SIGN_STYLE=Automatic \
  COMPILER_INDEX_STORE_ENABLE=NO \
  SWIFT_OPTIMIZATION_LEVEL='-Onone' \
  ENTRY_FILE=index.js \
  build

APP=~/Library/Developer/Xcode/DerivedData/Zonemate-*/Build/Products/Release-iphoneos/Zonemate.app
xcrun devicectl device install app --device <기기UUID> "$APP"
xcrun devicectl device process launch --device <기기UUID> <번들ID>
```

## 왜 이 플래그들이 필요한가 (하나라도 빠지면 빌드가 멈추거나 실패)
- `SWIFT_OPTIMIZATION_LEVEL=-Onone` — Release 기본 최적화(-O)에서 ExpoModulesCore Swift
  컴파일 중 swift-frontend가 데드락(0% CPU 무한대기). Debug가 되고 Release만 멈추던 원인.
- `ENTRY_FILE=index.js` — 경로에 한글(몰입캠프)이 있어 Metro가 절대경로 entry를 못 풀고
  "Unable to resolve module index.js"로 실패. 상대경로로 넘기면 됨.
- `COMPILER_INDEX_STORE_ENABLE=NO` — 인덱싱 비활성(빌드 중 행 위험 감소).
- 번들러(getConfig)가 동기 readFileSync에서 멈추면 `node_modules` 재손상이므로
  `rm -rf node_modules && npm install`로 복구.
- Xcode GUI가 같은 워크스페이스를 열고 있으면 CLI 빌드가 락 대기로 멈춘다 → Xcode 종료.
- Debug/Release가 DerivedData를 공유해 codegen이 충돌하면
  `rm -rf ~/Library/Developer/Xcode/DerivedData/Zonemate-*` 후 재빌드.

## 팀/번들 ID 메모
- 번들 ID는 팀마다 전역 고유해야 한다. `io.zonemate.mobile.mjkim`은 다른 팀에 등록돼 있어
  재사용 불가 → 팀 바뀔 때마다 새 값으로.
- 팀 ID는 Xcode 계정 로그인 후 `defaults read com.apple.dt.Xcode IDEProvisioningTeams`로 확인 가능.

import { requireOptionalNativeModule } from 'expo';

// 네이티브 FocusShield 모듈(iOS 전용). Expo Go/안드로이드/미빌드 환경에서는
// 존재하지 않으므로 optional로 불러오고, 없으면 모든 기능을 no-op 처리한다.
// 이렇게 해야 개발 빌드가 아닌 환경에서도 JS가 죽지 않는다.
const native = requireOptionalNativeModule<FocusShieldNativeModule>('FocusShield');

// 앱 차단 기능 전체 온/오프 스위치. Family Controls 엔타이틀먼트는 무료 Apple
// 계정에서 서명이 안 돼, 지금은 엔타이틀먼트를 뺀 채로 기기 테스트를 하므로
// false로 둔다. 유료 개발자 계정이 생기면 app.json에 엔타이틀먼트를 되살리고
// 이 값을 true로 바꾸면 차단 UI와 실제 shield가 활성화된다.
export const SHIELD_ENABLED = true;

interface SelectionSummary {
  apps: number;
  categories: number;
}

interface FocusShieldNativeModule {
  isSupported(): boolean;
  authorizationStatus(): 'notDetermined' | 'denied' | 'approved' | 'unsupported';
  requestAuthorization(): Promise<boolean>;
  presentPicker(): Promise<SelectionSummary>;
  selectionSummary(): SelectionSummary;
  startShield(): boolean;
  stopShield(): void;
}

// iOS 개발 빌드 + SHIELD_ENABLED일 때만 실제 동작. 그 외(Expo Go/안드로이드/
// 엔타이틀먼트 없는 빌드)에서는 false/no-op.
export const isFocusShieldAvailable = (): boolean =>
  SHIELD_ENABLED && Boolean(native?.isSupported?.());

export const authorizationStatus = (): string =>
  native?.authorizationStatus?.() ?? 'unsupported';

export const requestAuthorization = async (): Promise<boolean> => {
  if (!native) return false;
  return native.requestAuthorization();
};

export const presentAppPicker = async (): Promise<SelectionSummary> => {
  if (!native) return { apps: 0, categories: 0 };
  return native.presentPicker();
};

export const getSelectionSummary = (): SelectionSummary =>
  native?.selectionSummary?.() ?? { apps: 0, categories: 0 };

// 집중 시작/종료 시 호출. SHIELD_ENABLED가 false면 아무것도 안 한다.
export const startShield = (): boolean => (SHIELD_ENABLED ? Boolean(native?.startShield?.()) : false);
export const stopShield = (): void => {
  if (SHIELD_ENABLED) native?.stopShield?.();
};

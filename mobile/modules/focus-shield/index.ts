import { requireOptionalNativeModule } from 'expo';

// 네이티브 FocusShield 모듈(iOS 전용). Expo Go/안드로이드/미빌드 환경에서는
// 존재하지 않으므로 optional로 불러오고, 없으면 모든 기능을 no-op 처리한다.
// 이렇게 해야 개발 빌드가 아닌 환경에서도 JS가 죽지 않는다.
const native = requireOptionalNativeModule<FocusShieldNativeModule>('FocusShield');

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

// iOS 개발 빌드에서만 실제 동작. 그 외(Expo Go/안드로이드)에서는 false/no-op.
export const isFocusShieldAvailable = (): boolean => Boolean(native?.isSupported?.());

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

// 집중 시작/종료 시 호출. 저장된 선택이 없으면 startShield는 false 반환.
export const startShield = (): boolean => Boolean(native?.startShield?.());
export const stopShield = (): void => native?.stopShield?.();

import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI

// Zonemate 집중 모드용 앱 차단(Forest식). iOS Screen Time(FamilyControls +
// ManagedSettings) 기반이라 "지금 어떤 앱이 열렸는지"를 읽는 게 아니라,
// 사용자가 미리 고른 앱들에 차단막(shield)을 씌워 집중 중 아예 못 열게 한다.
//
// 흐름:
//   1) requestAuthorization() — 스크린타임 권한(개별) 요청
//   2) presentPicker() — FamilyActivityPicker로 막을 앱 선택 → UserDefaults에 저장
//   3) startShield() — 저장된 선택에 차단막 적용(집중 시작 시)
//   4) stopShield()  — 차단막 해제(집중 종료 시)
//
// FamilyActivitySelection의 토큰은 불투명(opaque)해서 이 앱 밖에선 의미가
// 없고, 앱이 FamilyControls 엔타이틀먼트를 가져야만 동작한다.

private let kSelectionKey = "zonemate.focusShield.selection"

// 차단막을 관리하는 스토어.
private let managedStore = ManagedSettingsStore()

@available(iOS 16.0, *)
private func loadSelection() -> FamilyActivitySelection? {
  guard let data = UserDefaults.standard.data(forKey: kSelectionKey) else { return nil }
  return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
}

@available(iOS 16.0, *)
private func saveSelection(_ selection: FamilyActivitySelection) {
  if let data = try? JSONEncoder().encode(selection) {
    UserDefaults.standard.set(data, forKey: kSelectionKey)
  }
}

public class FocusShieldModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FocusShield")

    // 이 기기가 Screen Time 차단을 지원하는지(iOS 16+).
    Function("isSupported") { () -> Bool in
      if #available(iOS 16.0, *) { return true }
      return false
    }

    // 현재 권한 상태: "notDetermined" | "denied" | "approved" | "unsupported"
    Function("authorizationStatus") { () -> String in
      guard #available(iOS 16.0, *) else { return "unsupported" }
      switch AuthorizationCenter.shared.authorizationStatus {
      case .notDetermined: return "notDetermined"
      case .denied: return "denied"
      // .approved 및 iOS 26+의 .approvedWithDataAccess 등 승인 계열은 모두 승인으로 본다.
      default: return "approved"
      }
    }

    // 스크린타임 권한 요청. 성공하면 true.
    AsyncFunction("requestAuthorization") { (promise: Promise) in
      guard #available(iOS 16.0, *) else {
        promise.reject("unsupported", "iOS 16 이상에서만 지원해요")
        return
      }
      Task {
        do {
          try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
          promise.resolve(true)
        } catch {
          promise.reject("auth_failed", "스크린타임 권한을 받지 못했어요: \(error.localizedDescription)")
        }
      }
    }

    // 막을 앱을 고르는 시스템 피커(FamilyActivityPicker)를 띄운다.
    // 선택을 저장하고, 고른 앱/카테고리 수를 반환한다.
    AsyncFunction("presentPicker") { (promise: Promise) in
      guard #available(iOS 16.0, *) else {
        promise.reject("unsupported", "iOS 16 이상에서만 지원해요")
        return
      }
      DispatchQueue.main.async {
        guard let root = Self.topViewController() else {
          promise.reject("no_window", "화면을 찾지 못했어요")
          return
        }
        let initial = loadSelection() ?? FamilyActivitySelection()
        let pickerView = FamilyActivityPickerContainer(initialSelection: initial) { result in
          root.dismiss(animated: true)
          if let result = result {
            saveSelection(result)
            promise.resolve([
              "apps": result.applicationTokens.count,
              "categories": result.categoryTokens.count,
            ])
          } else {
            // 취소 — 기존 선택 개수를 그대로 반환
            promise.resolve([
              "apps": loadSelection()?.applicationTokens.count ?? 0,
              "categories": loadSelection()?.categoryTokens.count ?? 0,
            ])
          }
        }
        let host = UIHostingController(rootView: pickerView)
        host.modalPresentationStyle = .formSheet
        root.present(host, animated: true)
      }
    }

    // 저장된 선택으로 지금 몇 개 앱/카테고리가 잡혀 있는지.
    Function("selectionSummary") { () -> [String: Int] in
      guard #available(iOS 16.0, *), let sel = loadSelection() else {
        return ["apps": 0, "categories": 0]
      }
      return ["apps": sel.applicationTokens.count, "categories": sel.categoryTokens.count]
    }

    // 집중 시작: 저장된 선택에 차단막 적용.
    Function("startShield") { () -> Bool in
      guard #available(iOS 16.0, *), let sel = loadSelection() else { return false }
      managedStore.shield.applications = sel.applicationTokens.isEmpty ? nil : sel.applicationTokens
      managedStore.shield.applicationCategories = sel.categoryTokens.isEmpty
        ? nil
        : ShieldSettings.ActivityCategoryPolicy.specific(sel.categoryTokens)
      return true
    }

    // 집중 종료: 차단막 해제.
    Function("stopShield") {
      if #available(iOS 16.0, *) {
        managedStore.shield.applications = nil
        managedStore.shield.applicationCategories = nil
      }
    }
  }

  // 현재 최상단 뷰컨트롤러(피커를 그 위에 present).
  private static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes
    let windowScene = scenes.first { $0.activationState == .foregroundActive } as? UIWindowScene
      ?? scenes.first as? UIWindowScene
    let keyWindow = windowScene?.windows.first { $0.isKeyWindow } ?? windowScene?.windows.first
    var top = keyWindow?.rootViewController
    while let presented = top?.presentedViewController {
      top = presented
    }
    return top
  }
}

// FamilyActivityPicker를 감싸 "완료/취소" 버튼과 함께 모달로 띄우는 컨테이너.
@available(iOS 16.0, *)
private struct FamilyActivityPickerContainer: View {
  @State private var selection: FamilyActivitySelection
  let onDone: (FamilyActivitySelection?) -> Void

  init(initialSelection: FamilyActivitySelection, onDone: @escaping (FamilyActivitySelection?) -> Void) {
    _selection = State(initialValue: initialSelection)
    self.onDone = onDone
  }

  var body: some View {
    NavigationView {
      FamilyActivityPicker(selection: $selection)
        .navigationTitle("집중 중 막을 앱")
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("취소") { onDone(nil) }
          }
          ToolbarItem(placement: .confirmationAction) {
            Button("완료") { onDone(selection) }
          }
        }
    }
  }
}

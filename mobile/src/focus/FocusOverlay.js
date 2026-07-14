import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { useFocusSession } from './FocusSessionContext';

function formatElapsed(startedAt, now) {
  if (!startedAt) return '0:00';
  const totalSec = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// 세션이 활성일 때 어느 탭에 있든 화면 전체를 덮는 집중 오버레이.
// 데스크톱(frontend/src/components/FocusMode.jsx)이 집중 중 전체 화면을
// 덮는 것과 같은 역할 — 이 기기에서 시작했든(source 'mobile') 다른
// 기기(PC)에서 시작했든, 계정이 집중 중이면 여기서도 같이 집중 모드가 뜬다.
export default function FocusOverlay() {
  const { session, now, active, isMine, busy, stopFocus } = useFocusSession();
  if (!active) return null;

  const onBreak = session.status === 'onBreak';

  return (
    <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
      <View style={styles.inner}>
        <View style={styles.statusPill}>
          <View style={styles.dot} />
          <Text style={styles.statusPillText}>
            {onBreak ? '휴식 중' : '집중 중'}{!isMine ? ' · 다른 기기' : ''}
          </Text>
        </View>

        <Text style={styles.mascot}>🐱</Text>

        {session.taskTitle ? (
          <>
            <Text style={styles.taskKicker}>지금 하는 일</Text>
            <Text style={styles.taskTitle}>{session.taskTitle}</Text>
          </>
        ) : null}

        <Text style={styles.elapsed}>{formatElapsed(session.startedAt, now)}</Text>
        <Text style={styles.elapsedLabel}>경과 시간</Text>

        {session.targetMinutes ? (
          <Text style={styles.target}>목표 {session.targetMinutes}분</Text>
        ) : null}

        <Text style={styles.hint}>
          {isMine
            ? '이 기기에서 시작한 집중이에요. 연동된 다른 기기에서도 같이 보여요.'
            : '다른 기기에서 시작한 집중이에요. 여기서 종료하면 그 기기에서도 같이 끝나요.'}
        </Text>

        <Pressable style={styles.stopButton} onPress={stopFocus} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.urgent} /> : <Text style={styles.stopLabel}>집중 종료</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.ground,
    zIndex: 100,
  },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface2, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14, marginBottom: 20,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.signal },
  statusPillText: { fontSize: 13, fontWeight: '700', color: colors.signal },
  mascot: { fontSize: 56, marginBottom: 16 },
  taskKicker: { fontSize: 11, fontWeight: '600', color: colors.text2, marginBottom: 2 },
  taskTitle: { fontSize: 18, fontWeight: '700', color: colors.text1, marginBottom: 18, textAlign: 'center' },
  elapsed: { fontSize: 56, fontWeight: '800', color: colors.text1 },
  elapsedLabel: { fontSize: 12, color: colors.text2, marginTop: 2, marginBottom: 12 },
  target: { fontSize: 13, color: colors.text2, marginBottom: 16 },
  hint: { fontSize: 12.5, color: colors.text2, lineHeight: 19, textAlign: 'center', marginBottom: 28, maxWidth: 300 },
  stopButton: {
    borderWidth: 1.5, borderColor: colors.urgent, borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 40, alignItems: 'center',
  },
  stopLabel: { color: colors.urgent, fontWeight: '700', fontSize: 14 },
});

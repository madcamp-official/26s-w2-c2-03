import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { useFocusSession } from './FocusSessionContext';

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// 집중이 끝났을 때 뜨는 요약 대시보드. 모바일은 앱/입력 추적이 없어 데스크톱
// 처럼 이탈/집중력 곡선은 못 그리지만, 총 집중 시간·할 일·목표 달성은 보여준다.
export default function FocusSummary() {
  const { summary, dismissSummary } = useFocusSession();
  if (!summary) return null;

  const totalMin = Math.round(summary.totalMs / 60000);
  const target = summary.targetMinutes;
  const achieved = target ? summary.totalMs >= target * 60000 : null;
  const progressPct = target ? Math.min(100, Math.round((summary.totalMs / (target * 60000)) * 100)) : 0;

  const headline = achieved === null
    ? '집중 완료!'
    : achieved
      ? '목표 달성! 🎉'
      : '수고했어요';

  return (
    <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
      <View style={styles.inner}>
        <Text style={styles.mascot}>🐱</Text>
        <Text style={styles.headline}>{headline}</Text>

        {summary.taskTitle ? (
          <>
            <Text style={styles.taskKicker}>방금 집중한 일</Text>
            <Text style={styles.taskTitle}>{summary.taskTitle}</Text>
          </>
        ) : null}

        <View style={styles.bigStat}>
          <Text style={styles.bigValue}>{formatDuration(summary.totalMs)}</Text>
          <Text style={styles.bigLabel}>총 집중 시간</Text>
        </View>

        {target ? (
          <View style={styles.targetCard}>
            <View style={styles.targetRow}>
              <Text style={styles.targetLabel}>목표 {target}분</Text>
              <Text style={[styles.targetVal, achieved && styles.targetValDone]}>
                {totalMin}분 집중 · {progressPct}%
              </Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${progressPct}%` }, achieved && styles.barFillDone]} />
            </View>
          </View>
        ) : null}

        <Text style={styles.note}>
          이탈·집중력 그래프는 앱 추적이 되는 데스크톱에서 볼 수 있어요.
        </Text>

        <Pressable style={styles.button} onPress={dismissSummary}>
          <Text style={styles.buttonLabel}>확인</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.ground, zIndex: 200 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  mascot: { fontSize: 52, marginBottom: 10 },
  headline: { fontSize: 22, fontWeight: '800', color: colors.text1, marginBottom: 18 },
  taskKicker: { fontSize: 11, fontWeight: '600', color: colors.text2, marginBottom: 2 },
  taskTitle: { fontSize: 16, fontWeight: '700', color: colors.text1, marginBottom: 18, textAlign: 'center' },
  bigStat: { alignItems: 'center', marginBottom: 18 },
  bigValue: { fontSize: 52, fontWeight: '800', color: colors.signal },
  bigLabel: { fontSize: 12.5, color: colors.text2, marginTop: 2 },
  targetCard: {
    width: '100%', maxWidth: 340, backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.line, padding: 14, marginBottom: 20,
  },
  targetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  targetLabel: { fontSize: 13, fontWeight: '600', color: colors.text2 },
  targetVal: { fontSize: 13, fontWeight: '700', color: colors.text1 },
  targetValDone: { color: colors.signal },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.text2 },
  barFillDone: { backgroundColor: colors.signal },
  note: { fontSize: 12, color: colors.text2, textAlign: 'center', lineHeight: 18, marginBottom: 26, maxWidth: 300 },
  button: { backgroundColor: colors.signal, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 48 },
  buttonLabel: { color: colors.signalInk, fontWeight: '700', fontSize: 14 },
});

import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { fetchFocusSession, pushFocusSession, stopFocusSessionRemote } from '../api';
import { usePlannerData } from '../planner/PlannerDataContext';

const POLL_MS = 5000;

function formatElapsed(startedAt) {
  if (!startedAt) return '0:00';
  const totalSec = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// PC의 pollFocus처럼 앱 감지는 못 하지만(모바일 기획서 참고 — OS 정책상
// iOS는 불가, Android도 아직 미구현), 사용자가 직접 시작/종료하는 수동
// 타이머로 "지금 집중 중"임을 계정 전체(PC 포함)에 공유한다. 다른 기기가
// 이미 집중 중이면(source가 내 쪽이 아니면) 여기서는 읽기 전용으로 따라
// 보여준다 — 모바일에서 멈춰도 PC가 5초 뒤 다시 덮어써서 뜻대로 안 되므로
// 데스크톱발 세션에 한해서는 컨트롤을 숨겨 혼란을 막는다.
export default function FocusScreen() {
  const { tasks } = usePlannerData();
  const [session, setSession] = useState(null); // null=로딩중
  // 데스크톱(FocusStartModal.jsx)과 같은 기준 — 오늘 할 일 중 안 끝난 '작업'만 후보로.
  const candidateTasks = (tasks || []).filter((t) => t.type === 'task' && !t.done);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [manualEntry, setManualEntry] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [targetMinutes, setTargetMinutes] = useState('25');
  const [busy, setBusy] = useState(false);
  const [, forceTick] = useState(0);
  const pollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const { session } = await fetchFocusSession();
        if (!cancelled) setSession(session);
      } catch {
        // 폴링 실패는 조용히 다음 tick에 재시도 — 미러링은 부가 기능
      }
    }
    poll();
    pollRef.current = setInterval(poll, POLL_MS);
    const tickTimer = setInterval(() => forceTick((n) => n + 1), 1000); // 경과 시간 표시 갱신용
    return () => {
      cancelled = true;
      clearInterval(pollRef.current);
      clearInterval(tickTimer);
    };
  }, []);

  // 할 일 목록이 처음 로드됐을 때 첫 번째 작업을 기본 선택해 둔다(데스크톱과 동일한 UX).
  useEffect(() => {
    if (selectedTaskId == null && candidateTasks.length > 0) {
      setSelectedTaskId(candidateTasks[0].id);
    }
  }, [candidateTasks, selectedTaskId]);

  const selectedTask = candidateTasks.find((t) => t.id === selectedTaskId) || null;

  async function handleStart() {
    const title = manualEntry ? taskTitle.trim() : selectedTask?.title;
    if (!title) return;
    const minutes = manualEntry ? (Number(targetMinutes) || null) : (selectedTask?.targetMinutes || null);
    setBusy(true);
    try {
      const startedAt = new Date().toISOString();
      await pushFocusSession({
        status: 'focusing', taskTitle: title,
        targetMinutes: minutes, source: 'mobile',
        gauge: null, currentState: 'focus', startedAt,
      });
      setSession({ status: 'focusing', taskTitle: title, targetMinutes: minutes, source: 'mobile', startedAt });
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    setBusy(true);
    try {
      await stopFocusSessionRemote();
      setSession({ status: 'idle' });
    } finally {
      setBusy(false);
    }
  }

  if (session === null) {
    return (
      <SafeAreaView style={styles.page}>
        <ActivityIndicator color={colors.signal} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const isFocusing = session.status === 'focusing' || session.status === 'onBreak';
  const isMine = session.source === 'mobile';
  const canStart = manualEntry ? Boolean(taskTitle.trim()) : Boolean(selectedTask);

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>집중 모드</Text>

        {!isFocusing && (
          <View style={styles.card}>
            <Text style={styles.hint}>이 계정에 등록된 다른 기기가 지금 집중 중이 아니에요. 폰에서 바로 시작할 수 있어요.</Text>

            {!manualEntry && (
              <>
                <Text style={styles.fieldLabel}>오늘 할 일 중 무엇에 집중할까요?</Text>
                {candidateTasks.length === 0 ? (
                  <Text style={styles.hint}>오늘 할 일이 없어요. 직접 입력해서 시작할 수 있어요.</Text>
                ) : (
                  candidateTasks.map((t) => (
                    <Pressable
                      key={t.id}
                      style={[styles.taskRow, selectedTaskId === t.id && styles.taskRowSelected]}
                      onPress={() => setSelectedTaskId(t.id)}
                    >
                      <View style={[styles.radio, selectedTaskId === t.id && styles.radioSelected]} />
                      <Text style={styles.taskRowTitle}>{t.title}</Text>
                      <Text style={styles.taskRowMin}>{t.targetMinutes}분</Text>
                    </Pressable>
                  ))
                )}
                <Pressable onPress={() => setManualEntry(true)}>
                  <Text style={styles.switchLink}>목록에 없는 걸로 직접 입력할래요</Text>
                </Pressable>
              </>
            )}

            {manualEntry && (
              <>
                <Text style={styles.fieldLabel}>지금 하는 일</Text>
                <TextInput style={styles.input} value={taskTitle} onChangeText={setTaskTitle} placeholder="예: 독서, 과제" />
                <Text style={styles.fieldLabel}>목표 시간(분)</Text>
                <TextInput style={styles.input} value={targetMinutes} onChangeText={setTargetMinutes} keyboardType="number-pad" />
                {candidateTasks.length > 0 && (
                  <Pressable onPress={() => setManualEntry(false)}>
                    <Text style={styles.switchLink}>오늘 할 일에서 고를래요</Text>
                  </Pressable>
                )}
              </>
            )}

            <Pressable style={styles.primaryButton} onPress={handleStart} disabled={busy || !canStart}>
              {busy ? <ActivityIndicator color={colors.signalInk} /> : <Text style={styles.primaryLabel}>집중 시작</Text>}
            </Pressable>
          </View>
        )}

        {isFocusing && (
          <View style={styles.card}>
            <View style={styles.statusPill}>
              <View style={styles.dot} />
              <Text style={styles.statusPillText}>
                {session.status === 'onBreak' ? '휴식 중' : '집중 중'}
                {!isMine ? ' (다른 기기)' : ''}
              </Text>
            </View>
            {session.taskTitle && <Text style={styles.taskTitle}>{session.taskTitle}</Text>}
            <Text style={styles.elapsed}>{formatElapsed(session.startedAt)}</Text>
            <Text style={styles.hint}>
              {isMine
                ? '이 폰에서 시작한 집중이에요. 다른 기기에서도 같이 보여요.'
                : '다른 기기에서 시작한 집중을 따라 보여주는 중이에요. 여기서 멈추면 그 기기에서도 같이 끝나요.'}
            </Text>
            <Pressable style={styles.dangerButton} onPress={handleStop} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.urgent} /> : <Text style={styles.dangerLabel}>집중 종료</Text>}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground },
  body: { flexGrow: 1, padding: 20 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text1, marginBottom: 14 },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: colors.line },
  hint: { fontSize: 12.5, color: colors.text2, lineHeight: 18, marginBottom: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: colors.text2, marginTop: 10, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 9,
    paddingHorizontal: 12, fontSize: 13.5, color: colors.text1, backgroundColor: colors.ground,
  },
  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.line,
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8, backgroundColor: colors.ground,
  },
  taskRowSelected: { borderColor: colors.signal, backgroundColor: colors.surface2 },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.line },
  radioSelected: { borderColor: colors.signal, backgroundColor: colors.signal },
  taskRowTitle: { flex: 1, fontSize: 13.5, color: colors.text1, fontWeight: '600' },
  taskRowMin: { fontSize: 12, color: colors.text2 },
  switchLink: { fontSize: 12, color: colors.signal, fontWeight: '600', marginTop: 4, marginBottom: 4 },
  primaryButton: { backgroundColor: colors.signal, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  primaryLabel: { color: colors.signalInk, fontWeight: '700', fontSize: 13.5 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: colors.surface2, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12, marginBottom: 12,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.signal },
  statusPillText: { fontSize: 12, fontWeight: '700', color: colors.signal },
  taskTitle: { fontSize: 15, fontWeight: '700', color: colors.text1, marginBottom: 4 },
  elapsed: { fontSize: 34, fontWeight: '700', color: colors.text1, marginBottom: 10 },
  dangerButton: { borderWidth: 1, borderColor: colors.urgent, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 6 },
  dangerLabel: { color: colors.urgent, fontWeight: '700', fontSize: 13 },
});

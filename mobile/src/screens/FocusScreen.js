import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { usePlannerData } from '../planner/PlannerDataContext';
import { useFocusSession } from '../focus/FocusSessionContext';

// 집중 "시작" 폼만 담당한다. 세션이 활성이 되면(내가 시작했든 다른 기기가
// 시작했든) FocusOverlay가 화면 전체를 덮으므로, 이 탭은 idle일 때만 보인다.
// 데스크톱(FocusStartModal.jsx)처럼 오늘 할 일에서 골라 시작하거나, 목록에
// 없으면 직접 입력해서 시작할 수 있다.
export default function FocusScreen() {
  const { tasks } = usePlannerData();
  const { active, busy, startFocus } = useFocusSession();

  const candidateTasks = (tasks || []).filter((t) => t.type === 'task' && !t.done);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [manualEntry, setManualEntry] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [targetMinutes, setTargetMinutes] = useState('25');

  // 할 일 목록이 처음 로드됐을 때 첫 번째 작업을 기본 선택(데스크톱과 동일 UX).
  useEffect(() => {
    if (selectedTaskId == null && candidateTasks.length > 0) {
      setSelectedTaskId(candidateTasks[0].id);
    }
  }, [candidateTasks, selectedTaskId]);

  const selectedTask = candidateTasks.find((t) => t.id === selectedTaskId) || null;
  const canStart = manualEntry ? Boolean(taskTitle.trim()) : Boolean(selectedTask);

  function handleStart() {
    const title = manualEntry ? taskTitle.trim() : selectedTask?.title;
    if (!title) return;
    const minutes = manualEntry ? (Number(targetMinutes) || null) : (selectedTask?.targetMinutes || null);
    startFocus({ taskTitle: title, targetMinutes: minutes });
  }

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>집중 모드</Text>

        <View style={styles.card}>
          <Text style={styles.hint}>집중을 시작하면 연동된 다른 기기에서도 함께 집중 모드가 켜져요.</Text>

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

          <Pressable style={styles.primaryButton} onPress={handleStart} disabled={busy || active || !canStart}>
            {busy ? <ActivityIndicator color={colors.signalInk} /> : <Text style={styles.primaryLabel}>집중 시작</Text>}
          </Pressable>
        </View>
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
});

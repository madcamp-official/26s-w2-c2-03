import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { usePlannerData } from '../planner/PlannerDataContext';
import { generateDeadlineRoadmap, fetchDailyArchive } from '../api';
import {
  WEEKDAYS, buildMonthGrid, startOfMonth, addMonths, isSameDay, toDateKey,
} from '../utils/calendarGrid';

let idCounter = 1;
function makeId(prefix) {
  return `${prefix}-${idCounter++}-${Date.now()}`;
}

const CELL_SIZE = (Dimensions.get('window').width - 40) / 7;

export default function CalendarScreen() {
  const { events, tasks, addEvent, updateEvent, removeEvent, dataReady } = usePlannerData();
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [selectedKey, setSelectedKey] = useState(() => toDateKey(new Date()));
  // 선택한 날의 할 일. 오늘이면 라이브 tasks를 그대로 쓰고, 다른 날이면
  // daily-archives에서 불러온다(데스크톱 DatePlanEditor와 같은 규칙).
  const [archiveTasks, setArchiveTasks] = useState(null); // null=로딩중/미조회
  const [archiveLoading, setArchiveLoading] = useState(false);

  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState(''); // "YYYY-MM-DD HH:MM" 형식으로 직접 입력
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [roadmap, setRoadmap] = useState(null);
  const [lastEventId, setLastEventId] = useState(null);

  const grid = useMemo(() => buildMonthGrid(monthDate), [monthDate]);
  const todayKey = toDateKey(new Date());

  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const ev of events) {
      const d = new Date(ev.date);
      if (Number.isNaN(d.getTime())) continue;
      const key = toDateKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    return map;
  }, [events]);

  const selectedDayEvents = eventsByDay.get(selectedKey) || [];
  const isSelectedToday = selectedKey === todayKey;

  // 오늘이 아닌 날을 선택하면 그 날의 아카이브를 불러온다. 오늘이면 라이브
  // tasks를 쓰므로 조회하지 않는다.
  useEffect(() => {
    if (isSelectedToday) {
      setArchiveTasks(null);
      return undefined;
    }
    let cancelled = false;
    setArchiveLoading(true);
    fetchDailyArchive(selectedKey)
      .then((data) => { if (!cancelled) setArchiveTasks(data.tasks || []); })
      .catch(() => { if (!cancelled) setArchiveTasks([]); })
      .finally(() => { if (!cancelled) setArchiveLoading(false); });
    return () => { cancelled = true; };
  }, [selectedKey, isSelectedToday]);

  // 선택한 날의 할 일 목록(오늘=라이브, 그 외=아카이브).
  const selectedDayTasks = isSelectedToday ? (tasks || []) : (archiveTasks || []);
  // 오늘 할 일이 있는지 — 오늘 칸에 점을 찍어 표시하기 위함.
  const todayHasTasks = (tasks || []).length > 0;

  async function handleSubmit() {
    if (!title.trim() || !deadline.trim()) return;
    // "YYYY-MM-DD HH:MM" 형식을 datetime-local과 같은 로컬시간 문자열로 변환.
    const isoLike = deadline.trim().replace(' ', 'T');
    if (Number.isNaN(new Date(isoLike).getTime())) {
      setError('마감 형식은 "2026-07-20 18:00"처럼 입력해주세요');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await generateDeadlineRoadmap({ title, details: '', deadline: isoLike });
      const cleanRoadmap = [...result.roadmap].sort((a, b) => a.order - b.order);
      const eventId = makeId('deadline');
      addEvent({ id: eventId, title: result.eventName, date: isoLike, kind: 'deadline', roadmap: cleanRoadmap });
      setLastEventId(eventId);
      setRoadmap(cleanRoadmap.map((step) => ({ ...step, id: makeId('step'), included: false, calendarEventId: null })));
      setTitle('');
      setDeadline('');
      setSelectedKey(toDateKey(new Date(isoLike)));
    } catch (err) {
      setError(err.message || '로드맵을 만드는 데 실패했어요');
    } finally {
      setLoading(false);
    }
  }

  function toggleStep(step) {
    if (!step.included) {
      const eventId = `${step.id}-evt`;
      addEvent({ id: eventId, title: step.title, date: step.suggestedDate, kind: 'roadmap', parentId: lastEventId });
      setRoadmap((prev) => prev.map((s) => (s.id === step.id ? { ...s, included: true, calendarEventId: eventId } : s)));
    } else {
      removeEvent(step.calendarEventId);
      setRoadmap((prev) => prev.map((s) => (s.id === step.id ? { ...s, included: false, calendarEventId: null } : s)));
    }
  }

  if (!dataReady) {
    return (
      <SafeAreaView style={styles.page}>
        <ActivityIndicator color={colors.signal} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollBody}>
        <Text style={styles.sectionTitle}>마감 태스크 등록</Text>
        <View style={styles.formCard}>
          <Text style={styles.fieldLabel}>언제까지 마감인 태스크가 있나요?</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="예: 디자인 리뷰 공유" />
          <Text style={styles.fieldLabel}>마감 날짜와 시간</Text>
          <TextInput style={styles.input} value={deadline} onChangeText={setDeadline} placeholder="2026-07-20 18:00" />
          {error && <Text style={styles.errorText}>{error}</Text>}
          <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={loading || !title.trim() || !deadline.trim()}>
            {loading ? <ActivityIndicator color={colors.signalInk} /> : <Text style={styles.primaryLabel}>캘린더에 등록하고 로드맵 만들기</Text>}
          </Pressable>

          {roadmap && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.fieldLabel}>로드맵 — 캘린더에 등록할 단계를 선택하세요</Text>
              {roadmap.map((step) => (
                <Pressable key={step.id} style={styles.roadmapRow} onPress={() => toggleStep(step)}>
                  <View style={[styles.checkboxBox, step.included && styles.checkboxBoxChecked]}>
                    {step.included && <Text style={styles.checkboxMark}>✓</Text>}
                  </View>
                  <Text style={styles.roadmapTitle} numberOfLines={1}>{step.title}</Text>
                  <Text style={styles.roadmapDate}>{new Date(step.suggestedDate).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>캘린더</Text>
        <View style={styles.calNav}>
          <Pressable onPress={() => setMonthDate((d) => addMonths(d, -1))} style={styles.calNavBtn}><Text>‹</Text></Pressable>
          <Text style={styles.calMonth}>{monthDate.getFullYear()}. {String(monthDate.getMonth() + 1).padStart(2, '0')}</Text>
          <Pressable onPress={() => setMonthDate((d) => addMonths(d, 1))} style={styles.calNavBtn}><Text>›</Text></Pressable>
        </View>

        <View style={styles.weekdayRow}>
          {WEEKDAYS.map((w) => <Text key={w} style={styles.weekday}>{w}</Text>)}
        </View>
        <View style={styles.grid}>
          {grid.map((day) => {
            const key = toDateKey(day);
            const inMonth = day.getMonth() === monthDate.getMonth();
            const isToday = key === todayKey;
            const isSelected = key === selectedKey;
            const dayEvents = eventsByDay.get(key) || [];
            return (
              <Pressable key={key} style={styles.cell} onPress={() => setSelectedKey(key)}>
                <View style={[
                  styles.dateBadge,
                  isToday && styles.dateBadgeToday,
                  isSelected && !isToday && styles.dateBadgeSelected,
                ]}
                >
                  <Text style={[
                    styles.dateText,
                    !inMonth && styles.dateTextOutside,
                    isToday && styles.dateTextToday,
                  ]}
                  >
                    {day.getDate()}
                  </Text>
                </View>
                {(dayEvents.length > 0 || (isToday && todayHasTasks)) && (
                  <View style={[styles.dot, dayEvents.some((e) => e.kind === 'deadline') && styles.dotUrgent]} />
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.dayDetail}>
          <Text style={styles.dayDetailTitle}>
            {selectedKey}{isSelectedToday ? ' · 오늘' : ''}
          </Text>

          <Text style={styles.detailSectionLabel}>일정</Text>
          {selectedDayEvents.length === 0 && <Text style={styles.hintText}>이 날의 일정이 없어요.</Text>}
          {selectedDayEvents.map((ev) => (
            <View key={ev.id} style={styles.eventRow}>
              <View style={[styles.eventTag, ev.kind === 'deadline' ? styles.eventTagUrgent : styles.eventTagSignal]}>
                <Text style={styles.eventTagText}>{ev.kind === 'deadline' ? '마감' : '로드맵'}</Text>
              </View>
              <Text style={styles.eventTitle} numberOfLines={1}>{ev.title}</Text>
              <Pressable onPress={() => removeEvent(ev.id)} hitSlop={8}>
                <Text style={styles.removeX}>×</Text>
              </Pressable>
            </View>
          ))}

          <Text style={styles.detailSectionLabel}>할 일</Text>
          {!isSelectedToday && archiveLoading && <Text style={styles.hintText}>불러오는 중...</Text>}
          {!archiveLoading && selectedDayTasks.length === 0 && (
            <Text style={styles.hintText}>
              {isSelectedToday ? '오늘 할 일이 없어요. "오늘의 계획" 탭에서 추가하세요.' : '이 날의 할 일 기록이 없어요.'}
            </Text>
          )}
          {!archiveLoading && selectedDayTasks.map((t) => (
            <View key={t.id} style={styles.detailTaskRow}>
              <View style={[styles.detailCheck, t.done && styles.detailCheckDone]}>
                {t.done && <Text style={styles.detailCheckMark}>✓</Text>}
              </View>
              <Text style={[styles.detailTaskTitle, t.done && styles.detailTaskTitleDone]} numberOfLines={1}>
                {t.title}
              </Text>
              <Text style={styles.detailTaskMeta}>
                {t.startTime ? `${t.startTime} · ` : ''}{t.targetMinutes}분
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground },
  scrollBody: { padding: 20, paddingBottom: 60 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text1, marginBottom: 12, marginTop: 8 },
  formCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: colors.text2, marginTop: 10, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 9,
    paddingHorizontal: 12, fontSize: 13.5, color: colors.text1, backgroundColor: colors.ground,
  },
  errorText: { color: colors.urgent, fontSize: 12.5, marginTop: 8 },
  primaryButton: { backgroundColor: colors.signal, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 14 },
  primaryLabel: { color: colors.signalInk, fontWeight: '700', fontSize: 13 },
  roadmapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  checkboxBox: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxBoxChecked: { backgroundColor: colors.signal, borderColor: colors.signal },
  checkboxMark: { color: colors.signalInk, fontSize: 11, fontWeight: '700' },
  roadmapTitle: { flex: 1, fontSize: 12.5, color: colors.text1 },
  roadmapDate: { fontSize: 11, color: colors.text2 },
  calNav: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
  calNavBtn: {
    width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
  },
  calMonth: { fontSize: 14, fontWeight: '700', color: colors.text1 },
  weekdayRow: { flexDirection: 'row' },
  weekday: { width: CELL_SIZE, textAlign: 'center', fontSize: 11, color: colors.text2, fontWeight: '600', marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL_SIZE, height: CELL_SIZE, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dateBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dateBadgeToday: { backgroundColor: colors.signal },
  dateBadgeSelected: { borderWidth: 1.5, borderColor: colors.signal },
  dateText: { fontSize: 13, color: colors.text1 },
  dateTextOutside: { color: colors.text2, opacity: 0.5 },
  dateTextToday: { color: colors.signalInk, fontWeight: '700' },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.signal },
  dotUrgent: { backgroundColor: colors.urgent },
  dayDetail: { marginTop: 16, backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.line },
  dayDetailTitle: { fontSize: 13, fontWeight: '700', color: colors.text1, marginBottom: 8 },
  detailSectionLabel: { fontSize: 10.5, fontWeight: '700', color: colors.text2, marginTop: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  hintText: { fontSize: 12.5, color: colors.text2 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  eventTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  eventTagUrgent: { backgroundColor: colors.urgent },
  eventTagSignal: { backgroundColor: colors.signal },
  eventTagText: { color: colors.signalInk, fontSize: 10, fontWeight: '700' },
  eventTitle: { flex: 1, fontSize: 12.5, color: colors.text1 },
  removeX: { fontSize: 16, color: colors.text2, paddingHorizontal: 4 },
  detailTaskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  detailCheck: {
    width: 16, height: 16, borderRadius: 5, borderWidth: 1.5, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  detailCheckDone: { backgroundColor: colors.signal, borderColor: colors.signal },
  detailCheckMark: { color: colors.signalInk, fontSize: 10, fontWeight: '700' },
  detailTaskTitle: { flex: 1, fontSize: 12.5, color: colors.text1 },
  detailTaskTitleDone: { textDecorationLine: 'line-through', color: colors.text2 },
  detailTaskMeta: { fontSize: 11, color: colors.text2 },
});

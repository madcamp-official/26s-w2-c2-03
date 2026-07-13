import { useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { usePlannerData } from '../planner/PlannerDataContext';
import { generatePlanChat } from '../api';

let idCounter = 1;
function makeId() {
  return `item-${idCounter++}-${Date.now()}`;
}

const INITIAL_BOT_MESSAGE = '오늘 할 일을 편하게 알려주세요. 짧게 적어도 괜찮아요, 필요하면 제가 한두 가지만 더 물어볼게요.';

function ChatBubble({ role, text }) {
  const isUser = role === 'user';
  return (
    <View style={[styles.chatRow, isUser && styles.chatRowUser]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
        <Text style={isUser ? styles.bubbleUserText : styles.bubbleBotText}>{text}</Text>
      </View>
    </View>
  );
}

function ChecklistItem({ item, onToggleDone, onRemove }) {
  return (
    <View style={[styles.taskRow, item.type === 'break' && styles.taskRowBreak]}>
      <Pressable onPress={onToggleDone} style={styles.checkbox}>
        <View style={[styles.checkboxBox, item.done && styles.checkboxBoxChecked]}>
          {item.done && <Text style={styles.checkboxMark}>✓</Text>}
        </View>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={[styles.taskTitle, item.done && styles.taskTitleDone]}>{item.title}</Text>
        <Text style={styles.taskMeta}>
          {item.startTime ? `${item.startTime} · ` : ''}{item.targetMinutes}분
        </Text>
      </View>
      <Pressable onPress={onRemove} hitSlop={8}>
        <Text style={styles.removeX}>×</Text>
      </Pressable>
    </View>
  );
}

export default function TodayScreen({ navigation }) {
  const { tasks, setTasks, dayEndTime, setDayEnd, dataReady } = usePlannerData();

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [planDone, setPlanDone] = useState(false);
  const questionCountRef = useRef(0);

  async function sendMessage() {
    const text = draft.trim();
    if (!text || loading || planDone) return;
    const nextMessages = [...messages, { role: 'user', text }];
    setMessages(nextMessages);
    setDraft('');
    setLoading(true);
    setError(null);
    try {
      const forceFinalize = questionCountRef.current >= 2;
      const result = await generatePlanChat({ messages: nextMessages, forceFinalize });
      if (result.done) {
        setMessages((prev) => [...prev, { role: 'assistant', text: '계획을 만들었어요. 아래에서 확인하고 필요하면 직접 수정하세요.' }]);
        const withState = [...result.items].sort((a, b) => a.order - b.order).map((it) => ({ ...it, id: makeId(), done: false }));
        setTasks((prev) => {
          const preserved = (prev || []).filter((it) => it.sourceEventId);
          return [...withState, ...preserved].map((it, i) => ({ ...it, order: i + 1 }));
        });
        if (result.dayEndTime) setDayEnd(result.dayEndTime);
        setPlanDone(true);
      } else {
        questionCountRef.current += 1;
        setMessages((prev) => [...prev, { role: 'assistant', text: result.question }]);
      }
    } catch (err) {
      setError(err.message || '대화를 진행하는 데 실패했어요');
    } finally {
      setLoading(false);
    }
  }

  function resetChat() {
    setMessages([]);
    setDraft('');
    setError(null);
    setPlanDone(false);
    questionCountRef.current = 0;
  }

  function toggleDone(id) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }
  function removeTask(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id).map((t, i) => ({ ...t, order: i + 1 })));
  }
  function addTask(type) {
    setTasks((prev) => [...(prev || []), {
      id: makeId(), type, title: type === 'break' ? '잠깐 휴식' : '새 작업',
      targetMinutes: type === 'break' ? 5 : 15, order: (prev || []).length + 1, done: false,
    }]);
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
      <View style={styles.topbar}>
        <Text style={styles.wordmark}>
          <Text style={{ color: colors.signal, fontWeight: '800' }}>Zone</Text>mate
        </Text>
        <Pressable onPress={() => navigation.navigate('DevicePairing')}>
          <Text style={styles.topbarLink}>기기 연동</Text>
        </Pressable>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>오늘의 계획</Text>

          <View style={styles.chatCard}>
            <View style={styles.personaRow}>
              <View style={styles.mascot}><Text style={{ fontSize: 16 }}>🐱</Text></View>
              <View>
                <Text style={styles.personaName}>John</Text>
                <Text style={styles.personaRole}>오늘의 계획을 같이 세워주는 보조 도구</Text>
              </View>
            </View>

            <ChatBubble role="assistant" text={INITIAL_BOT_MESSAGE} />
            {messages.map((m, i) => <ChatBubble key={i} role={m.role} text={m.text} />)}
            {loading && <ChatBubble role="assistant" text="생각하는 중..." />}
            {error && <Text style={styles.errorText}>{error}</Text>}

            {planDone ? (
              <Pressable style={styles.ghostButton} onPress={resetChat}>
                <Text style={styles.ghostLabel}>새 대화로 다시 계획 짜기</Text>
              </Pressable>
            ) : (
              <View style={styles.chatInputRow}>
                <TextInput
                  style={styles.chatInput}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="예: 로그인 리팩토링, PR 리뷰"
                  editable={!loading}
                  multiline
                />
                <Pressable style={styles.sendButton} onPress={sendMessage} disabled={loading || !draft.trim()}>
                  <Text style={styles.sendLabel}>보내기</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View style={styles.checklist}>
            {tasks.map((item) => (
              <ChecklistItem key={item.id} item={item} onToggleDone={() => toggleDone(item.id)} onRemove={() => removeTask(item.id)} />
            ))}
            <View style={styles.addRow}>
              <Pressable style={styles.addButton} onPress={() => addTask('task')}>
                <Text style={styles.addButtonLabel}>+ 작업 추가</Text>
              </Pressable>
              <Pressable style={styles.addButton} onPress={() => addTask('break')}>
                <Text style={styles.addButtonLabel}>+ 휴식 추가</Text>
              </Pressable>
            </View>

            <View style={styles.dayEndRow}>
              <Text style={styles.dayEndLabel}>하루 마무리 시간</Text>
              <TextInput
                style={styles.dayEndInput}
                value={dayEndTime || ''}
                onChangeText={(v) => setDayEnd(v || null)}
                placeholder="HH:MM"
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground },
  topbar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  wordmark: { fontSize: 16, fontWeight: '700', color: colors.text1 },
  topbarLink: { color: colors.text2, fontSize: 12.5 },
  scrollBody: { padding: 20, paddingBottom: 60 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text1, marginBottom: 14 },
  chatCard: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.line, marginBottom: 18,
  },
  personaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  mascot: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  personaName: { fontSize: 13.5, fontWeight: '700', color: colors.text1 },
  personaRole: { fontSize: 11, color: colors.text2 },
  chatRow: { flexDirection: 'row', marginBottom: 8 },
  chatRowUser: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', paddingVertical: 9, paddingHorizontal: 13, borderRadius: 14 },
  bubbleBot: { backgroundColor: colors.ground },
  bubbleUser: { backgroundColor: colors.signal },
  bubbleBotText: { color: colors.text1, fontSize: 13.5, lineHeight: 19 },
  bubbleUserText: { color: colors.signalInk, fontSize: 13.5, lineHeight: 19 },
  errorText: { color: colors.urgent, fontSize: 12.5, marginTop: 4 },
  chatInputRow: { flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'flex-end' },
  chatInput: {
    flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 13.5, color: colors.text1,
    backgroundColor: colors.ground, maxHeight: 90,
  },
  sendButton: { backgroundColor: colors.signal, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  sendLabel: { color: colors.signalInk, fontWeight: '700', fontSize: 12.5 },
  ghostButton: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 9,
    alignItems: 'center', marginTop: 6,
  },
  ghostLabel: { color: colors.text2, fontWeight: '600', fontSize: 12.5 },
  checklist: { gap: 8 },
  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 10,
  },
  taskRowBreak: { borderStyle: 'dashed' },
  checkbox: { padding: 2 },
  checkboxBox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxBoxChecked: { backgroundColor: colors.signal, borderColor: colors.signal },
  checkboxMark: { color: colors.signalInk, fontSize: 12, fontWeight: '700' },
  taskTitle: { fontSize: 13.5, color: colors.text1, fontWeight: '600' },
  taskTitleDone: { textDecorationLine: 'line-through', color: colors.text2 },
  taskMeta: { fontSize: 11, color: colors.text2, marginTop: 2 },
  removeX: { fontSize: 18, color: colors.text2, paddingHorizontal: 4 },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  addButton: {
    flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10,
    paddingVertical: 9, alignItems: 'center', backgroundColor: colors.surface,
  },
  addButtonLabel: { fontSize: 12.5, color: colors.text1, fontWeight: '600' },
  dayEndRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10,
    paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line,
  },
  dayEndLabel: { fontSize: 13, fontWeight: '600', color: colors.text1 },
  dayEndInput: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 10,
    paddingVertical: 6, fontSize: 13, color: colors.text1, width: 90, textAlign: 'center',
  },
});

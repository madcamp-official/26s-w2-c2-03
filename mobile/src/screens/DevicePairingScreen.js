import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { pairDevice } from '../api';

// PC의 "기기 연동" 모달에 뜨는 6자리 코드를 입력해서 이 폰을 계정에 등록한다
// (backend/src/routes/devices.js의 /pair). 이름은 미리 채워두되 사용자가
// 바꿀 수 있게 — "민재 갤럭시"처럼 나중에 목록에서 알아보기 쉬운 이름이 좋다.
export default function DevicePairingScreen({ navigation }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState(Platform.OS === 'ios' ? '내 아이폰' : '내 안드로이드폰');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function handlePair() {
    setError(null);
    setLoading(true);
    try {
      await pairDevice({ code, name, platform: Platform.OS });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.card}>
          <Text style={styles.title}>연동 완료!</Text>
          <Text style={styles.hint}>이제 이 폰과 PC가 같은 계정으로 데이터를 공유해요.</Text>
          <Pressable style={styles.primaryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.primaryLabel}>돌아가기</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>PC와 연동하기</Text>
        <Text style={styles.hint}>PC의 Zonemate에서 "기기 연동" → "코드 받기"를 누르면 뜨는 6자리 코드를 입력하세요.</Text>

        <Text style={styles.fieldLabel}>인증 코드</Text>
        <TextInput
          style={[styles.input, styles.codeInput]}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="123456"
        />
        <Text style={styles.fieldLabel}>이 기기의 이름</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} />

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable style={styles.primaryButton} onPress={handlePair} disabled={loading || code.length !== 6 || !name.trim()}>
          {loading ? <ActivityIndicator color={colors.signalInk} /> : <Text style={styles.primaryLabel}>연동하기</Text>}
        </Pressable>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.skipText}>나중에 하기</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground, justifyContent: 'center', padding: 24 },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 28, borderWidth: 1, borderColor: colors.line },
  title: { fontSize: 20, fontWeight: '700', color: colors.text1, marginBottom: 8 },
  hint: { fontSize: 13, color: colors.text2, marginBottom: 18, lineHeight: 19 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: colors.text2, marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 10,
    paddingHorizontal: 12, fontSize: 14, color: colors.text1, backgroundColor: colors.ground,
  },
  codeInput: { fontSize: 22, fontWeight: '700', letterSpacing: 4, textAlign: 'center' },
  errorText: { color: colors.urgent, fontSize: 13, marginTop: 10 },
  primaryButton: { backgroundColor: colors.signal, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 20 },
  primaryLabel: { color: colors.signalInk, fontWeight: '700', fontSize: 14 },
  skipText: { textAlign: 'center', marginTop: 14, color: colors.text2, fontSize: 12.5 },
});

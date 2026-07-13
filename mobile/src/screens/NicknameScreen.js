import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '../theme';
import { setNickname as apiSetNickname } from '../api';
import { useAuth } from '../auth/AuthContext';

export default function NicknameScreen() {
  const { refresh } = useAuth();
  const [nickname, setNicknameInput] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      await apiSetNickname(nickname);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.wordmark}>
          <Text style={{ color: colors.signal, fontWeight: '800' }}>Zone</Text>mate
        </Text>
        <Text style={styles.title}>어떻게 불러드리면 될까요?</Text>
        <Text style={styles.fieldLabel}>닉네임</Text>
        <TextInput style={styles.input} value={nickname} onChangeText={setNicknameInput} maxLength={20} />
        {error && <Text style={styles.errorText}>{error}</Text>}
        <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={loading || !nickname.trim()}>
          {loading ? <ActivityIndicator color={colors.signalInk} /> : <Text style={styles.primaryLabel}>시작하기</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground, justifyContent: 'center', padding: 24 },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 28, borderWidth: 1, borderColor: colors.line },
  wordmark: { fontSize: 17, fontWeight: '700', color: colors.text1, marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text1, marginBottom: 18 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: colors.text2, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 10,
    paddingHorizontal: 12, fontSize: 14, color: colors.text1, backgroundColor: colors.ground,
  },
  errorText: { color: colors.urgent, fontSize: 13, marginTop: 10 },
  primaryButton: { backgroundColor: colors.signal, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 18 },
  primaryLabel: { color: colors.signalInk, fontWeight: '700', fontSize: 14 },
});

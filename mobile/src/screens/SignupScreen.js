import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '../theme';
import { sendVerificationCode, verifyEmailCode } from '../api';
import { useAuth } from '../auth/AuthContext';

export default function SignupScreen({ navigation }) {
  const { signIn } = useAuth();
  const [step, setStep] = useState('form'); // 'form' | 'code'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSendCode() {
    setError(null);
    if (password !== passwordConfirm) {
      setError('비밀번호가 서로 달라요');
      return;
    }
    setLoading(true);
    try {
      const res = await sendVerificationCode({ email, password, passwordConfirm });
      if (res?.devCode) {
        setDevCode(res.devCode);
        setCode(res.devCode);
      }
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    setError(null);
    setLoading(true);
    try {
      const { token } = await verifyEmailCode({ email, code });
      await signIn(token);
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
        <Text style={styles.title}>이메일로 가입하기</Text>

        {step === 'form' ? (
          <>
            <Text style={styles.fieldLabel}>이메일</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <Text style={styles.fieldLabel}>비밀번호</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />
            <Text style={styles.fieldLabel}>비밀번호 확인</Text>
            <TextInput style={styles.input} value={passwordConfirm} onChangeText={setPasswordConfirm} secureTextEntry />
            {error && <Text style={styles.errorText}>{error}</Text>}
            <Pressable style={styles.primaryButton} onPress={handleSendCode} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.signalInk} /> : <Text style={styles.primaryLabel}>이메일로 인증번호 받기</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.hintText}>{email}로 인증번호를 보냈어요.</Text>
            {devCode && (
              <Text style={styles.devCodeText}>개발 모드: 인증번호 {devCode} — 이미 입력해 뒀어요.</Text>
            )}
            <Text style={styles.fieldLabel}>인증번호</Text>
            <TextInput style={styles.input} value={code} onChangeText={setCode} keyboardType="number-pad" />
            {error && <Text style={styles.errorText}>{error}</Text>}
            <Pressable style={styles.primaryButton} onPress={handleVerify} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.signalInk} /> : <Text style={styles.primaryLabel}>가입 완료</Text>}
            </Pressable>
            <Pressable style={styles.ghostButton} onPress={() => setStep('form')}>
              <Text style={styles.ghostLabel}>이메일 다시 입력</Text>
            </Pressable>
          </>
        )}

        <Pressable onPress={() => navigation.navigate('Login')}>
          <Text style={styles.switchText}>
            이미 계정이 있으신가요? <Text style={{ color: colors.signal, fontWeight: '600' }}>로그인</Text>
          </Text>
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
  fieldLabel: { fontSize: 11, fontWeight: '600', color: colors.text2, marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 10,
    paddingHorizontal: 12, fontSize: 14, color: colors.text1, backgroundColor: colors.ground,
  },
  hintText: { color: colors.text2, fontSize: 13, marginBottom: 4 },
  devCodeText: { color: colors.text2, fontSize: 12, marginBottom: 4 },
  errorText: { color: colors.urgent, fontSize: 13, marginTop: 10 },
  primaryButton: { backgroundColor: colors.signal, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 18 },
  primaryLabel: { color: colors.signalInk, fontWeight: '700', fontSize: 14 },
  ghostButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  ghostLabel: { color: colors.text2, fontWeight: '600', fontSize: 12.5 },
  switchText: { textAlign: 'center', marginTop: 18, color: colors.text2, fontSize: 12.5 },
});

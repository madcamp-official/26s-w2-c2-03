import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { colors } from '../theme';
import { kakaoLoginUrl, googleLoginUrl } from '../api';
import { useAuth } from '../auth/AuthContext';

// 카카오/구글 콜백이 zonemate://auth-callback?token=...으로 돌아오면
// openAuthSessionAsync가 그 딥링크를 결과로 돌려준다 — 새 창/시스템 브라우저를
// 거치지 않고 앱 안에서 인증 세션이 끝난다.
async function completeOAuth(buildStartUrl, signIn) {
  const redirectUrl = Linking.createURL('auth-callback');
  const result = await WebBrowser.openAuthSessionAsync(buildStartUrl(redirectUrl), redirectUrl);
  if (result.type !== 'success' || !result.url) return;

  const { queryParams } = Linking.parse(result.url);
  if (queryParams?.error) {
    Alert.alert('로그인 실패', '다시 시도해주세요.');
    return;
  }
  if (queryParams?.token) {
    await signIn(queryParams.token);
  }
}

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [oauthLoading, setOauthLoading] = useState(null); // 'kakao' | 'google' | null

  async function handleOAuth(provider) {
    setOauthLoading(provider);
    try {
      await completeOAuth(provider === 'kakao' ? kakaoLoginUrl : googleLoginUrl, signIn);
    } catch {
      Alert.alert('로그인 실패', '다시 시도해주세요.');
    } finally {
      setOauthLoading(null);
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.wordmark}>
          <Text style={{ color: colors.signal, fontWeight: '800' }}>Zone</Text>mate
        </Text>
        <Text style={styles.title}>로그인</Text>

        <Pressable
          style={[styles.oauthButton, { backgroundColor: colors.kakao }]}
          onPress={() => handleOAuth('kakao')}
          disabled={oauthLoading !== null}
        >
          {oauthLoading === 'kakao'
            ? <ActivityIndicator color={colors.kakaoInk} />
            : <Text style={[styles.oauthLabel, { color: colors.kakaoInk }]}>카카오로 시작하기</Text>}
        </Pressable>
        <Pressable
          style={[styles.oauthButton, styles.googleButton]}
          onPress={() => handleOAuth('google')}
          disabled={oauthLoading !== null}
        >
          {oauthLoading === 'google'
            ? <ActivityIndicator color={colors.text1} />
            : <Text style={[styles.oauthLabel, { color: colors.text1 }]}>구글로 시작하기</Text>}
        </Pressable>

      </View>
    </View>
  );
}

// 앱 시작 시 한 번 미리 열어두면 openAuthSessionAsync가 더 빠르게 뜬다(iOS).
WebBrowser.maybeCompleteAuthSession();

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground, justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 28,
    borderWidth: 1, borderColor: colors.line,
  },
  wordmark: { fontSize: 17, fontWeight: '700', color: colors.text1, marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text1, marginBottom: 18 },
  oauthButton: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 8 },
  googleButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  oauthLabel: { fontSize: 14, fontWeight: '600' },
});

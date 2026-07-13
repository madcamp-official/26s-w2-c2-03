import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { useAuth } from '../auth/AuthContext';

// 1단계(뼈대+로그인) 자리 표시 화면. 캘린더/오늘의 계획은 2단계에서 채운다.
export default function TodayScreen() {
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <View style={styles.topbar}>
        <Text style={styles.wordmark}>
          <Text style={{ color: colors.signal, fontWeight: '800' }}>Zone</Text>mate
        </Text>
        <Pressable onPress={logout}>
          <Text style={styles.logout}>로그아웃</Text>
        </Pressable>
      </View>
      <View style={styles.body}>
        <Text style={styles.greeting}>{user?.nickname}님, 로그인 성공!</Text>
        <Text style={styles.hint}>오늘의 계획·캘린더 화면은 다음 단계에서 이어서 만듭니다.</Text>
      </View>
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
  logout: { color: colors.text2, fontSize: 13 },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 8 },
  greeting: { fontSize: 17, fontWeight: '700', color: colors.text1 },
  hint: { fontSize: 13, color: colors.text2, textAlign: 'center' },
});

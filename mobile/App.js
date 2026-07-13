import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { colors } from './src/theme';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import NicknameScreen from './src/screens/NicknameScreen';
import TodayScreen from './src/screens/TodayScreen';
import DevicePairingScreen from './src/screens/DevicePairingScreen';

const Stack = createNativeStackNavigator();

// 로그인 여부/닉네임 여부에 따라 보여줄 화면 묶음을 통째로 바꾼다 —
// 데스크톱(frontend/src/App.jsx)의 RequireAuth/RequireNoNickname과 같은 규칙.
function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ground }}>
        <ActivityIndicator color={colors.signal} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
        </>
      ) : !user.nickname ? (
        <Stack.Screen name="Nickname" component={NicknameScreen} />
      ) : (
        <>
          <Stack.Screen name="Today" component={TodayScreen} />
          <Stack.Screen name="DevicePairing" component={DevicePairingScreen} options={{ headerShown: true, title: '기기 연동' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
        <StatusBar style="dark" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { PlannerDataProvider } from './src/planner/PlannerDataContext';
import { colors } from './src/theme';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import NicknameScreen from './src/screens/NicknameScreen';
import TodayScreen from './src/screens/TodayScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import FocusScreen from './src/screens/FocusScreen';
import DevicePairingScreen from './src/screens/DevicePairingScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ label, focused }) {
  return <Text style={{ fontSize: 11, fontWeight: focused ? '700' : '500', color: focused ? colors.signal : colors.text2 }}>{label}</Text>;
}

// 데스크톱(page-nav)의 "오늘의 계획 / 마감·캘린더" 탭에 대응. 집중은 데스크톱은
// 트레이/모달로 열지만, 모바일은 앱 감지가 없어 수동 타이머 화면이라 별도 탭으로 뺐다.
function MainTabs() {
  return (
    <PlannerDataProvider>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.signal,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        }}
      >
        <Tab.Screen name="Today" component={TodayScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon label="오늘" focused={focused} />, tabBarLabel: '오늘의 계획' }} />
        <Tab.Screen name="Calendar" component={CalendarScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon label="달력" focused={focused} />, tabBarLabel: '캘린더' }} />
        <Tab.Screen name="Focus" component={FocusScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon label="집중" focused={focused} />, tabBarLabel: '집중 모드' }} />
      </Tab.Navigator>
    </PlannerDataProvider>
  );
}

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
          <Stack.Screen name="Main" component={MainTabs} />
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

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const CHANNEL_ID = 'planned-breaks';
const NOTIFICATION_KIND = 'zonemate-planned-break';
const MAX_SCHEDULED_BREAKS = 50;

let syncQueue = Promise.resolve();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveBreakDate(task, dayEndDate, now) {
  if (!/^\d{2}:\d{2}$/.test(task?.startTime || '')) return null;
  const [hour, minute] = task.startTime.split(':').map(Number);
  if (hour > 23 || minute > 59) return null;

  const scheduledAt = new Date(now);
  scheduledAt.setHours(hour, minute, 0, 0);

  // 자정을 넘기는 계획에서 새벽 휴식은 오늘이 아니라 계획 종료일에 예약한다.
  if (hour < 6 && /^\d{4}-\d{2}-\d{2}$/.test(dayEndDate || '') && dayEndDate > localDateKey(now)) {
    const [year, month, day] = dayEndDate.split('-').map(Number);
    scheduledAt.setFullYear(year, month - 1, day);
  }
  return scheduledAt;
}

async function cancelExistingPlannedBreaks() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((notification) => notification.content?.data?.kind === NOTIFICATION_KIND)
      .map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier)),
  );
}

async function ensurePermission() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: '계획된 휴식',
      description: '계획표에 등록한 휴식 시간이 되면 알려줍니다.',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 180, 250],
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

async function performSync(tasks, dayEndDate) {
  if (Platform.OS === 'web') return { granted: false, scheduled: 0 };

  await cancelExistingPlannedBreaks();
  const now = new Date();
  const breaks = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => task?.type === 'break' && !task.done)
    .map((task) => ({ task, scheduledAt: resolveBreakDate(task, dayEndDate, now) }))
    .filter(({ scheduledAt }) => scheduledAt && scheduledAt > now)
    .sort((a, b) => a.scheduledAt - b.scheduledAt)
    .slice(0, MAX_SCHEDULED_BREAKS);

  if (breaks.length === 0) return { granted: false, scheduled: 0 };
  const granted = await ensurePermission();
  if (!granted) return { granted: false, scheduled: 0 };

  await Promise.all(breaks.map(({ task, scheduledAt }) => {
    const minutes = Math.max(1, Number(task.targetMinutes) || 5);
    return Notifications.scheduleNotificationAsync({
      content: {
        title: `${task.title || '휴식'} 시간이에요`,
        body: `계획표대로 ${minutes}분 동안 잠깐 쉬어가세요.`,
        sound: 'default',
        data: { kind: NOTIFICATION_KIND, taskId: String(task.id || '') },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: scheduledAt,
        channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
      },
    });
  }));

  return { granted: true, scheduled: breaks.length };
}

export function syncPlannedBreakNotifications(tasks, dayEndDate) {
  syncQueue = syncQueue
    .catch(() => {})
    .then(() => performSync(tasks, dayEndDate));
  return syncQueue;
}

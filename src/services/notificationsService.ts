import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID = 'workout-reminders';
const REMINDER_ID = 'daily-workout-reminder';
// Fixed default time — not user-configurable yet. A "pick your own time" picker in Settings
// would be a reasonable follow-up, but wasn't part of what was asked here.
const REMINDER_HOUR = 22; // 7:00 PM local device time
const REMINDER_MINUTE = 0;

// Shows the reminder as a banner even if the app happens to be in the foreground when it
// fires — the default handler (none set) suppresses foreground notifications entirely.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let channelReady = false;
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android' || channelReady) return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Workout Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  channelReady = true;
}

/** Requests OS notification permission if not already decided. Returns whether it's granted. */
async function requestPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  // Android grants at install time and never re-prompts once denied; iOS shows a real dialog
  // only the first time — safe to call unconditionally, it won't spam repeat prompts either way.
  const result = await Notifications.requestPermissionsAsync();
  return result.granted;
}

async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
}

/**
 * Ensures exactly one daily reminder is scheduled, replacing any previous one — idempotent,
 * so it's safe to call on every app start / profile load rather than only on toggle-flip.
 */
async function scheduleDailyReminder(): Promise<void> {
  await ensureChannel();
  await cancelDailyReminder();
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: 'Time to move! 💪',
      body: "You haven't logged a workout today — even a quick session keeps your streak alive.",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: REMINDER_HOUR,
      minute: REMINDER_MINUTE,
    },
  });
}

/**
 * Single entry point, called whenever the user's notificationsEnabled preference (profile
 * field) loads or changes — see AppContext.tsx. Returns false only when the user wanted
 * reminders on but OS permission was denied, so the caller can revert the toggle/profile
 * field and tell them, rather than silently leaving it "on" with nothing actually scheduled.
 */
export async function syncReminderState(enabled: boolean): Promise<boolean> {
  if (!enabled) {
    await cancelDailyReminder();
    return true;
  }
  const granted = await requestPermission();
  if (!granted) return false;
  await scheduleDailyReminder();
  return true;
}

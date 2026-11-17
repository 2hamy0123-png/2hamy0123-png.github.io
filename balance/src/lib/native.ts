// Bridges to the phone's own features. On the web these fall back to what a
// browser can do, so the same code runs in both places.
import { Capacitor } from '@capacitor/core';
import { allReminderIds, planReminders, type ReminderPlanInput } from './reminders';

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Hands a backup file to the share sheet (phone) or downloads it (browser). */
export async function shareBackup(text: string, fileName: string): Promise<void> {
  if (isNative()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const written = await Filesystem.writeFile({ path: fileName, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'Balance backup', dialogTitle: 'Save your Balance backup', url: written.uri });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export interface GpsFix {
  lat: number;
  lon: number;
  accuracy: number;
}

export type GpsStatus = 'ok' | 'weak' | 'off';

const noop = () => undefined;

/**
 * Starts location updates and returns a function that stops them. On the
 * phone this runs as a foreground service with a visible notification, so
 * tracking continues with the screen locked.
 */
export async function startTracking(onFix: (f: GpsFix) => void, onStatus: (s: GpsStatus) => void): Promise<() => void> {
  if (isNative()) {
    try {
      const { BackgroundGeolocation } = await import('@capgo/background-geolocation');
      let stopped = false;
      await BackgroundGeolocation.start(
        {
          backgroundTitle: 'Balance is tracking your activity',
          backgroundMessage: 'Open the app to see your time and distance.',
          requestPermissions: true,
          stale: false,
          distanceFilter: 0,
        },
        (loc, err) => {
          if (stopped) return;
          if (err) {
            onStatus(err.code === 'NOT_AUTHORIZED' ? 'off' : 'weak');
            return;
          }
          if (!loc) return;
          onStatus(loc.accuracy <= 30 ? 'ok' : 'weak');
          onFix({ lat: loc.latitude, lon: loc.longitude, accuracy: loc.accuracy });
        },
      );
      return () => {
        stopped = true;
        void BackgroundGeolocation.stop().catch(noop);
      };
    } catch {
      onStatus('off');
      return noop;
    }
  }

  if (!('geolocation' in navigator)) {
    onStatus('off');
    return noop;
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      onStatus(accuracy <= 30 ? 'ok' : 'weak');
      onFix({ lat: latitude, lon: longitude, accuracy });
    },
    (err) => onStatus(err.code === err.PERMISSION_DENIED ? 'off' : 'weak'),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

/** Asks for permission to show reminders. Resolves true when granted. */
export async function requestReminderPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    return (await LocalNotifications.requestPermissions()).display === 'granted';
  } catch {
    return false;
  }
}

/** Replaces the scheduled reminders with the ones the plan calls for. */
export async function syncReminders(plan: ReminderPlanInput, now = new Date()): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: allReminderIds().map((id) => ({ id })) });
    if (!plan.on) return;
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
    try {
      await LocalNotifications.createChannel({ id: 'reminders', name: 'Reminders', description: 'Meal and day-end reminders', importance: 3 });
    } catch {
      // The channel already exists or this Android version has none.
    }
    const planned = planReminders(plan, now);
    if (planned.length === 0) return;
    await LocalNotifications.schedule({
      notifications: planned.map((p) => ({ id: p.id, title: p.title, body: p.body, channelId: 'reminders', schedule: { at: p.at, allowWhileIdle: true } })),
    });
  } catch {
    // Reminders are a convenience; a failure here must never break logging.
  }
}

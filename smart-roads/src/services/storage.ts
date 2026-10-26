// StorageService — small, failure-tolerant wrapper around localStorage.
// Storage can be unavailable (private windows, blocked site data), so every call is guarded
// and the app works without it.

import { DEFAULT_SETTINGS } from '../sim/defaults';
import type { Settings } from '../sim/types';

const PREFIX = 'smart-roads:';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — settings simply won't persist */
  }
}

function remove(key: string) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export const StorageService = {
  loadSettings(): Settings {
    const saved = read<Partial<Settings>>('settings', {});
    const merged = { ...DEFAULT_SETTINGS, ...saved };
    // Validate anything that could break the simulation.
    if (![0.5, 1, 2, 5].includes(merged.speed)) merged.speed = 1;
    if (merged.minGreen >= merged.maxGreen) {
      merged.minGreen = DEFAULT_SETTINGS.minGreen;
      merged.maxGreen = DEFAULT_SETTINGS.maxGreen;
    }
    return merged;
  },
  saveSettings(settings: Settings) {
    write('settings', settings);
  },
  clearSettings() {
    remove('settings');
  },
  get onboardingSeen(): boolean {
    return read('onboarding-seen', false);
  },
  set onboardingSeen(v: boolean) {
    write('onboarding-seen', v);
  },
  get sidebarCollapsed(): boolean {
    return read('sidebar-collapsed', false);
  },
  set sidebarCollapsed(v: boolean) {
    write('sidebar-collapsed', v);
  },
};

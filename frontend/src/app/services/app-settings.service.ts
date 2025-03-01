import { effect, inject, Injectable, signal, WritableSignal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { ApiService } from './api.service';

const STORAGE_KEY = 'soundboard-settings';

type Settings = {
  guildId: string | null;
  localVolume: number;
  soundCategories: string[];
  debug: boolean;
  autoJoin: boolean;
};

const DEFAULT_SETTINGS: Readonly<Settings> = {
  guildId: null,
  localVolume: 100,
  soundCategories: [],
  debug: false,
  autoJoin: true,
};

type Signals<T> = { [key in keyof T]: WritableSignal<T[key]> };

@Injectable({
  providedIn: 'root',
})
export class AppSettingsService {
  readonly settings: Signals<Settings>;

  constructor() {
    this.settings = this.getSettings();

    effect(() => {
      const transformedObject = Object.fromEntries(Object.entries(this.settings).map(([key, value]) => [key, value()]));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(transformedObject));
      } catch {}
    });

    const apiService = inject(ApiService);
    toObservable(apiService.user).subscribe(user => {
      const guildId = this.settings.guildId();
      if (guildId == null && user?.guilds && user.guilds.length > 0) {
        this.settings.guildId.set(user.guilds[0].id);
      }
    });
  }

  private getSettings(): Signals<Settings> {
    const baseSettings = {
      ...DEFAULT_SETTINGS,
      ...this.loadSavedSettings(),
    };

    return {
      guildId: signal(baseSettings.guildId),
      localVolume: signal(baseSettings.localVolume),
      soundCategories: signal(baseSettings.soundCategories),
      debug: signal(baseSettings.debug),
      autoJoin: signal(baseSettings.autoJoin),
    };
  }

  private loadSavedSettings(): Partial<Settings> {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }

    return {};
  }
}

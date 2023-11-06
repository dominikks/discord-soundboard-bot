import { effect, Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { ApiService } from './api.service';

const STORAGE_KEY = 'soundboard-settings';

@Injectable({
  providedIn: 'root',
})
export class AppSettingsService {
  readonly settings = {
    guildId: signal<string>(null),
    localVolume: signal(100),
    soundCategories: signal<string[]>([]),
    debug: signal(false),
    autoJoin: signal(true),
  };

  constructor(apiService: ApiService) {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        for (const key in data) {
          if (key in this.settings) {
            this.settings[key].set(data[key]);
          }
        }
      } catch {}
    }

    effect(() => {
      const transformedObject = Object.fromEntries(Object.entries(this.settings).map(([key, value]) => [key, value()]));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(transformedObject));
      } catch {}
    });

    toObservable(apiService.user).subscribe(user => {
      const guildId = this.settings.guildId();
      if (guildId == null && user?.guilds.length > 0) {
        this.settings.guildId.set(user.guilds[0].id);
      }
    });
  }
}

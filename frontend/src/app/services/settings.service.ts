import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { withLatestFrom } from 'rxjs/operators';
import { ApiService } from './api.service';

export type SoundTarget = 'discord' | 'local';

export interface SoundboardSettings {
  soundTarget$: BehaviorSubject<SoundTarget>;
  localVolume$: BehaviorSubject<number>;
  guildId$: BehaviorSubject<string>;
  soundCategory$: BehaviorSubject<string>;
  debug$: BehaviorSubject<boolean>;
}

const STORAGE_KEY = 'soundboard-settings';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private _settings: SoundboardSettings = {
    soundTarget$: new BehaviorSubject('local'),
    guildId$: new BehaviorSubject(null),
    localVolume$: new BehaviorSubject(100),
    soundCategory$: new BehaviorSubject(''),
    debug$: new BehaviorSubject(false),
  };

  get settings() {
    return this._settings;
  }

  constructor(apiService: ApiService) {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        for (const key in data) {
          if (key in this.settings) {
            this.settings[key].next(data[key]);
          }
        }
      } catch {}
    }

    apiService.guilds$.pipe(withLatestFrom(this.settings.guildId$)).subscribe(([guilds, guildId]) => {
      if (guildId == null && guilds.length > 0) {
        this.settings.guildId$.next(guilds[0].id);
      }
    });

    combineLatest([
      this.settings.soundTarget$,
      this.settings.guildId$,
      this.settings.localVolume$,
      this.settings.soundCategory$,
      this.settings.debug$,
    ]).subscribe(_ => this.save());
  }

  private save() {
    const transformedObject = Object.fromEntries(Object.entries(this.settings).map(([key, value]) => [key, value.value]));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transformedObject));
  }
}

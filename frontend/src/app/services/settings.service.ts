import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, combineLatest, Subject } from 'rxjs';
import { takeUntil, withLatestFrom } from 'rxjs/operators';
import { ApiService } from './api.service';

export type SoundTarget = 'discord' | 'local';

export interface SoundboardSettings {
  soundTarget$: BehaviorSubject<SoundTarget>;
  localVolume$: BehaviorSubject<number>;
  guildId$: BehaviorSubject<string>;
  soundCategories$: BehaviorSubject<string[]>;
  debug$: BehaviorSubject<boolean>;
  autoJoin$: BehaviorSubject<boolean>;
}

const STORAGE_KEY = 'soundboard-settings';

@Injectable({
  providedIn: 'root',
})
export class SettingsService implements OnDestroy {
  private onDestroy$ = new Subject<void>();

  private _settings: SoundboardSettings = {
    soundTarget$: new BehaviorSubject('discord'),
    guildId$: new BehaviorSubject(null),
    localVolume$: new BehaviorSubject(100),
    soundCategories$: new BehaviorSubject([]),
    debug$: new BehaviorSubject(false),
    autoJoin$: new BehaviorSubject(true),
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

    apiService.user$.pipe(takeUntil(this.onDestroy$), withLatestFrom(this.settings.guildId$)).subscribe(([user, guildId]) => {
      if (guildId == null && user.guilds.length > 0) {
        this.settings.guildId$.next(user.guilds[0].id);
      }
    });

    combineLatest([
      this.settings.soundTarget$,
      this.settings.guildId$,
      this.settings.localVolume$,
      this.settings.soundCategories$,
      this.settings.debug$,
    ])
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(_ => this.save());
  }

  private save() {
    const transformedObject = Object.fromEntries(Object.entries(this.settings).map(([key, value]) => [key, value.value]));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transformedObject));
    } catch {}
  }

  ngOnDestroy() {
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }
}

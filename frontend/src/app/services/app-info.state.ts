import { computed, Injectable, signal } from '@angular/core';
import { AppInfo } from './api.service';

@Injectable({ providedIn: 'root' })
export class AppInfoState {
  private readonly _data = signal<AppInfo | null>(null);

  readonly data = computed<AppInfo>(() => {
    const state = this._data();
    if (!state) throw new Error('App was not correctly initialized');

    return state;
  });

  initialize(appInfo: AppInfo) {
    this._data.set(appInfo);
  }
}

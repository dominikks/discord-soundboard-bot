import { HttpClient } from '@angular/common/http';
import { Injectable, OnDestroy } from '@angular/core';
import { map, retry, shareReplay, takeUntil, tap, withLatestFrom } from 'rxjs/operators';
import { sortBy } from 'lodash-es';
import { ReplaySubject, Subject } from 'rxjs';
import { Guild } from './api.service';
import { ErrorService } from './error.service';

interface ApiSound {
  id: string;
  guildId: string;
  name: string;
  category: string;
  createdAt: number;
  volumeAdjustment?: number;
  soundfile?: Soundfile;
}
export interface Soundfile {
  maxVolume: number;
  meanVolume: number;
  length: number;
  uploadedAt: number;
}
export class Sound implements ApiSound {
  id: string;
  guildId: string;
  name: string;
  category: string;
  createdAt: number;
  volumeAdjustment?: number;
  soundfile?: Soundfile;

  constructor(base: ApiSound) {
    this.id = base.id;
    this.guildId = base.guildId;
    this.name = base.name;
    this.category = base.category;
    this.createdAt = base.createdAt;
    this.volumeAdjustment = base.volumeAdjustment;
    this.soundfile = base.soundfile;
  }

  getDownloadUrl() {
    return `/api/sounds/${this.encodeId()}`;
  }

  getPlayUrl(guild: Guild | string) {
    // We can play a sound on a different guild than where it is located
    const guildid = typeof guild === 'string' ? guild : guild.id;
    return `/api/guilds/${guildid}/play/${this.encodeId()}`;
  }

  encodeId() {
    return this.id
      .split('/')
      .map(part => encodeURIComponent(part))
      .join('/');
  }
}

@Injectable({
  providedIn: 'root',
})
export class SoundsService implements OnDestroy {
  private onDestroy$ = new Subject<void>();

  // Observable that returns a sorted list of all sounds
  private _sounds$ = new ReplaySubject<Sound[]>(1);
  sounds$ = this._sounds$.pipe(
    map(sounds => sortBy(sounds, sound => sound.name.toLowerCase())),
    shareReplay<Sound[]>(1)
  );

  constructor(private http: HttpClient, private errorService: ErrorService) {
    this.http
      .get<ApiSound[]>('/api/sounds')
      .pipe(
        takeUntil(this.onDestroy$),
        retry(5),
        this.errorService.showError('Failed to load sounds'),
        map(sounds => sounds.map(sound => new Sound(sound)))
      )
      .subscribe(sounds => this._sounds$.next(sounds));
  }

  playSound(sound: Sound, guild: Guild | string) {
    return this.http.post(sound.getPlayUrl(guild), {});
  }

  stopSound(guild: Guild | string) {
    const guildid = typeof guild === 'string' ? guild : guild.id;
    return this.http.post(`/api/guilds/${guildid}/stop`, {}, { responseType: 'text' });
  }

  createSound(guildId: string, name: string, category: string) {
    return this.http.post<ApiSound>(`/api/sounds`, { guildId, name, category }).pipe(
      map(sound => new Sound(sound)),
      withLatestFrom(this.sounds$),
      map(([sound, sounds]) => {
        this._sounds$.next([sound, ...sounds]);
        return sound;
      })
    );
  }

  updateSound(sound: Sound) {
    return this.http
      .put(
        `/api/sounds/${encodeURIComponent(sound.id)}`,
        { name: sound.name, category: sound.category, volumeAdjustment: sound.volumeAdjustment },
        { responseType: 'text' }
      )
      .pipe(
        withLatestFrom(this.sounds$),
        tap(([, sounds]) => {
          const newSounds = sounds.filter(s => sound.id !== s.id);
          this._sounds$.next([...newSounds, sound]);
        })
      );
  }

  deleteSound(sound: Sound) {
    return this.http.delete(`/api/sounds/${encodeURIComponent(sound.id)}`, { responseType: 'text' }).pipe(
      withLatestFrom(this.sounds$),
      tap(([, sounds]) => {
        this._sounds$.next(sounds.filter(s => s.id !== sound.id));
      })
    );
  }

  uploadSound(sound: Sound, file: File) {
    return this.http
      .post<Soundfile>(`/api/sounds/${encodeURIComponent(sound.id)}`, file, {
        headers: {
          'Content-Type': file.type,
        },
      })
      .pipe(
        withLatestFrom(this.sounds$),
        map(([soundfile, sounds]) => {
          const newSounds = sounds.filter(s => sound.id !== s.id);
          this._sounds$.next([...newSounds, new Sound({ ...sound, soundfile })]);
          return soundfile;
        })
      );
  }

  ngOnDestroy() {
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }
}

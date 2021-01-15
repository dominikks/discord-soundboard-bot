import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map, retry, shareReplay } from 'rxjs/operators';
import { sortBy } from 'lodash-es';
import { Guild } from './api.service';

interface ApiSound {
  readonly id: string;
  readonly name: string;
  readonly category: string;
}
export class Sound implements ApiSound {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly downloadUrl: string;

  constructor(base: ApiSound) {
    this.id = base.id;
    this.name = base.name;
    this.category = base.category;
    this.downloadUrl = `/api/sounds/${this.encodeId()}`;
  }

  getPlayUrl(guild: Guild | string) {
    const guildid = typeof guild === 'string' ? guild : guild.id;
    return `/api/discord/${guildid}/play/${this.encodeId()}`;
  }

  encodeId() {
    return this.id
      .split('/')
      .map(part => encodeURIComponent(part))
      .join('/');
  }
}

export interface PlayResult {
  sound_volume?: {
    max_volume: number;
    mean_volume: number;
  };
  volume_adjustment: number;
}

@Injectable({
  providedIn: 'root',
})
export class SoundsService {
  // Observable that returns a sorted list of all sounds
  private _sounds$ = this.http.get<ApiSound[]>('/api/sounds').pipe(
    retry(5),
    map(sounds => sounds.map(sound => new Sound(sound))),
    map(sounds => sortBy(sounds, sound => sound.name.toLowerCase())),
    shareReplay<Sound[]>()
  );

  get sounds$() {
    return this._sounds$;
  }

  constructor(private http: HttpClient) {}

  playSound(sound: Sound, guild: Guild | string) {
    return this.http.post<PlayResult>(sound.getPlayUrl(guild), {});
  }

  stopSound(guild: Guild | string) {
    const guildid = typeof guild === 'string' ? guild : guild.id;
    return this.http.post(`/api/discord/${guildid}/stop`, {}, { responseType: 'text' });
  }
}

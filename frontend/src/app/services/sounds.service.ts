import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs/operators';
import { sortBy } from 'lodash-es';
import { Guild } from './api.service';

interface ApiSound {
  id: string;
  guildId: string;
  name: string;
  category: string;
  createdAt: number;
  volumeAdjustment?: number;
  soundFile?: Readonly<SoundFile>;
}

export interface SoundFile {
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
  soundFile?: Readonly<SoundFile>;

  constructor(base: ApiSound) {
    this.id = base.id;
    this.guildId = base.guildId;
    this.name = base.name;
    this.category = base.category;
    this.createdAt = base.createdAt;
    this.volumeAdjustment = base.volumeAdjustment;
    this.soundFile = base.soundFile;
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
export class SoundsService {
  private http = inject(HttpClient);

  loadSounds() {
    return this.http.get<ApiSound[]>('/api/sounds').pipe(
      map(sounds => sounds.map(sound => new Sound(sound))),
      map(sounds => sortBy(sounds, sound => sound.name.toLowerCase()))
    );
  }

  playSound(sound: Sound, guild: Guild | string, autojoin: boolean) {
    return this.http.post(sound.getPlayUrl(guild), {}, { params: { autojoin } });
  }

  stopSound(guild: Guild | string) {
    const guildId = typeof guild === 'string' ? guild : guild.id;
    return this.http.post(`/api/guilds/${guildId}/stop`, {}, { responseType: 'text' });
  }

  createSound(guildId: string, name: string, category: string) {
    return this.http.post<ApiSound>(`/api/sounds`, { guildId, name, category }).pipe(map(sound => new Sound(sound)));
  }

  updateSound(sound: Sound) {
    return this.http.put(
      `/api/sounds/${encodeURIComponent(sound.id)}`,
      { name: sound.name, category: sound.category, volumeAdjustment: sound.volumeAdjustment },
      { responseType: 'text' }
    );
  }

  deleteSound(sound: Sound) {
    return this.http.delete(`/api/sounds/${encodeURIComponent(sound.id)}`, { responseType: 'text' });
  }

  uploadSound(sound: Sound, file: File) {
    return this.http.post<SoundFile>(`/api/sounds/${encodeURIComponent(sound.id)}`, file, {
      headers: {
        'Content-Type': file.type,
      },
    });
  }
}

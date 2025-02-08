import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Guild } from './api.service';

interface ApiRecording {
  guildId: string;
  timestamp: number;
  users: ApiRecordingUser[];
  length: number;
}

export interface Recording extends ApiRecording {
  users: RecordingUser[];
}

interface ApiRecordingUser {
  username: string;
  id: string;
}

export interface RecordingUser extends ApiRecordingUser {
  username: string;
  id: string;
  url: string;
}

export interface RecordingMix {
  start: number;
  end: number;
  userIds: string[];
}

export interface MixingResult {
  downloadUrl: string;
}

@Injectable({
  providedIn: 'root',
})
export class RecorderService {
  private http = inject(HttpClient);

  record(guild: Guild | string) {
    const guildId = typeof guild === 'string' ? guild : guild.id;
    return this.http.post(`/api/guilds/${guildId}/record`, {}, { responseType: 'text' });
  }

  loadRecordings(): Observable<Recording[]> {
    return this.http.get<ApiRecording[]>('/api/recordings').pipe(
      map(data =>
        data.map(recording => ({
          ...recording,
          users: recording.users.map(user => ({
            ...user,
            url: `/api/guilds/${recording.guildId}/recordings/${recording.timestamp}/${user.id}`,
          })),
        }))
      )
    );
  }

  mixRecording(recording: Recording, mix: RecordingMix) {
    return this.http.post<MixingResult>(`/api/guilds/${recording.guildId}/recordings/${recording.timestamp}`, mix);
  }

  deleteRecording(recording: Recording) {
    return this.http.delete(`/api/guilds/${recording.guildId}/recordings/${recording.timestamp}`);
  }
}

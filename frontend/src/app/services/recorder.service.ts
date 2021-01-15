import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { retry } from 'rxjs/operators';
import { Guild } from './api.service';

export interface Recording {
  timestamp: number;
  users: RecordingUser[];
  length: number;
}

export interface RecordingUser {
  username: string;
  url: string;
}

export interface RecordingMix {
  start: number;
  end: number;
  users: string[];
}

export interface MixingResult {
  download_url: string;
}

@Injectable({
  providedIn: 'root',
})
export class RecorderService {
  constructor(private http: HttpClient) {}

  record(guild: Guild | string) {
    const guildid = typeof guild === 'string' ? guild : guild.id;
    return this.http.post(`/api/discord/${guildid}/record`, {}, { responseType: 'text' });
  }

  loadRecordings() {
    return this.http.get<Recording[]>('/api/recorder/recordings').pipe(retry(5));
  }

  mixRecording(recordingTimestamp: number, mix: RecordingMix) {
    return this.http.post<MixingResult>(`/api/recorder/recordings/${recordingTimestamp}`, mix);
  }

  deleteRecording(recordingTimestamp: number) {
    return this.http.delete(`/api/recorder/recordings/${recordingTimestamp}`);
  }
}

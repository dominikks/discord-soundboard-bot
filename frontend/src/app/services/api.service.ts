import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { map } from 'rxjs';
import { sortBy } from 'lodash-es';
import { tap } from 'rxjs/operators';

export interface AppInfo {
  version: string;
  buildId?: string;
  buildTimestamp?: number;
  discordClientId: string;
  legalUrl?: string;
}

export type UserRole = 'admin' | 'moderator' | 'user';

export interface Guild {
  id: string;
  name: string;
  iconUrl?: string;
  role: UserRole;
}

export interface User {
  id: string;
  username: string;
  discriminator: number;
  avatarUrl: string;
  guilds: Guild[];
}

export interface RandomInfix {
  guildId: string;
  infix: string;
  displayName: string;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  readonly user = signal<User | null>(null);
  readonly appInfo = signal<AppInfo>(null);

  constructor(private http: HttpClient) {}

  loadAppInfo() {
    return this.http.get<AppInfo>('/api/info');
  }

  loadUser() {
    return this.http.get<User>('/api/user');
  }

  loadRandomInfixes() {
    return this.http
      .get<RandomInfix[]>('/api/random-infixes')
      .pipe(map(infixes => sortBy(infixes, infix => infix.displayName.toLowerCase())));
  }

  joinCurrentChannel(guildId: string) {
    return this.http.post(`/api/guilds/${encodeURIComponent(guildId)}/join`, {}, { responseType: 'text' });
  }

  leaveChannel(guildId: string) {
    return this.http.post(`/api/guilds/${encodeURIComponent(guildId)}/leave`, {}, { responseType: 'text' });
  }

  logout() {
    return this.http.post('/api/auth/logout', {}, { responseType: 'text' }).pipe(tap(() => this.user.set(null)));
  }

  getAuthToken() {
    return this.http.post('/api/auth/gettoken', {}, { responseType: 'text' });
  }
}

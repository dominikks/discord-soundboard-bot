import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { map, mergeMap, retry, shareReplay, tap } from 'rxjs/operators';
import { sortBy } from 'lodash-es';
import { ErrorService } from './error.service';

export interface AppInfo {
  version: string;
  buildId?: string;
  buildTimestamp?: number;
  discordClientId: string;
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

export interface GuildSettings {
  userRoleId: string;
  moderatorRoleId: string;
  targetMeanVolume: number;
  targetMaxVolume: number;
}

export interface GuildData extends GuildSettings {
  roles: Map<string, string>;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  appInfo$ = this.http.get<AppInfo>('/api/info').pipe(retry(5), this.errorService.showError('Failed to fetch Server info'), shareReplay());
  user$ = this.http.get<User>('/api/user').pipe(retry(5), this.errorService.showError('Failed to fetch user data'), shareReplay());

  private loadRandomInfixes$ = new BehaviorSubject<void>(null);
  randomInfixes$ = this.loadRandomInfixes$.pipe(
    mergeMap(_ => this.http.get<RandomInfix[]>('/api/randominfixes')),
    retry(5),
    this.errorService.showError('Failed to fetch random buttons'),
    map(infixes => sortBy(infixes, infix => infix.displayName.toLowerCase())),
    shareReplay()
  );

  constructor(private http: HttpClient, private errorService: ErrorService) {
    this.loadRandomInfixes$.next();
  }

  updateRandomInfixes(guildId: string, infixes: { infix: string; displayName: string }[]) {
    return this.http
      .put(`/api/guilds/${encodeURIComponent(guildId)}/randominfixes`, infixes, { responseType: 'text' })
      .pipe(tap(() => this.loadRandomInfixes$.next()));
  }

  loadGuildSettings(guildId: string) {
    return this.http.get<GuildData>(`/api/guilds/${encodeURIComponent(guildId)}/settings`);
  }

  updateGuildSettings(guildId: string, guildSettings: Partial<GuildSettings>) {
    return this.http.put(`/api/guilds/${encodeURIComponent(guildId)}/settings`, guildSettings, { responseType: 'text' });
  }

  joinCurrentChannel(guildId: string) {
    return this.http.post(`/api/guilds/${encodeURIComponent(guildId)}/join`, {}, { responseType: 'text' });
  }

  leaveChannel(guildId: string) {
    return this.http.post(`/api/guilds/${encodeURIComponent(guildId)}/leave`, {}, { responseType: 'text' });
  }
}

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RandomInfix } from './api.service';

export interface GuildSettings {
  userRoleId: string;
  moderatorRoleId: string;
  targetMeanVolume: number;
  targetMaxVolume: number;
  roles: Map<string, string>;
}

@Injectable({ providedIn: 'root' })
export class GuildSettingsService {
  constructor(private http: HttpClient) {}

  updateRandomInfixes(guildId: string, infixes: Omit<RandomInfix, 'guildId'>[]) {
    return this.http.put(`/api/guilds/${encodeURIComponent(guildId)}/random-infixes`, infixes, { responseType: 'text' });
  }

  loadGuildSettings(guildId: string) {
    return this.http.get<GuildSettings>(`/api/guilds/${encodeURIComponent(guildId)}/settings`);
  }

  updateGuildSettings(guildId: string, guildSettings: Partial<Omit<GuildSettings, 'roles'>>) {
    return this.http.put(`/api/guilds/${encodeURIComponent(guildId)}/settings`, guildSettings, { responseType: 'text' });
  }
}

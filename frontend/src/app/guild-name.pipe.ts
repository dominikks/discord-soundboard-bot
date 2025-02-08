import { Pipe, PipeTransform, inject } from '@angular/core';
import { ApiService } from './services/api.service';

@Pipe({ name: 'guildName' })
export class GuildNamePipe implements PipeTransform {
  private apiService = inject(ApiService);

  transform(guildId: string) {
    return this.apiService.user().guilds.find(guild => guild.id === guildId).name;
  }
}

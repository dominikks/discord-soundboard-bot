import { inject, Pipe, PipeTransform } from '@angular/core';
import { ApiService } from '../services/api.service';

@Pipe({ name: 'guildName' })
export class GuildNamePipe implements PipeTransform {
  private apiService = inject(ApiService);

  transform(guildId: string): string {
    const user = this.apiService.user();
    if (!user) return guildId;
    
    const guild = user.guilds.find(guild => guild.id === guildId);
    return guild ? guild.name : guildId;
  }
}

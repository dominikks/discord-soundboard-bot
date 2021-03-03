import { Pipe, PipeTransform } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from './services/api.service';

@Pipe({
  name: 'guildName',
})
export class GuildNamePipe implements PipeTransform {
  constructor(private apiService: ApiService) {}

  transform(guildId: string): Observable<string> {
    return this.apiService.user$.pipe(map(user => user.guilds.find(guild => guild.id === guildId).name));
  }
}

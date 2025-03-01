import { inject, Pipe, PipeTransform } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { User } from '../services/api.service';

@Pipe({ name: 'guildName', pure: false })
export class GuildNamePipe implements PipeTransform {
  private route = inject(ActivatedRoute);
  private currentUser: User | undefined;

  constructor() {
    // Try to get the user from the route data
    this.route.root.data
      .pipe(
        map(data => data['user'] as User | undefined),
        takeUntilDestroyed(),
      )
      .subscribe(user => {
        this.currentUser = user;
      });
  }

  transform(guildId: string): string {
    if (!this.currentUser) return guildId;

    const guild = this.currentUser.guilds.find(guild => guild.id === guildId);
    return guild ? guild.name : guildId;
  }
}

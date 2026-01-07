import { inject, Pipe, PipeTransform } from '@angular/core';
import { Router } from '@angular/router';
import { User } from '../services/api.service';

@Pipe({ name: 'guildName', pure: false })
export class GuildNamePipe implements PipeTransform {
  private router = inject(Router);
  private user: User | undefined;

  constructor() {
    this.updateUserFromRoute();
  }

  private updateUserFromRoute(): void {
    // Try to find user data in any of the activated routes
    let route = this.router.routerState.snapshot.root;
    while (route) {
      if (route.data['user']) {
        this.user = route.data['user'] as User;
        break;
      }
      if (route.firstChild) {
        route = route.firstChild;
      } else {
        break;
      }
    }
  }

  transform(guildId: string): string {
    if (!this.user) return guildId;

    const guild = this.user.guilds.find(guild => guild.id === guildId);
    return guild?.name || guildId;
  }
}

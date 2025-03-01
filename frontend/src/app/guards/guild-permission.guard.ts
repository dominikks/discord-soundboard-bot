import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { User } from '../services/api.service';

export const guildPermissionGuard: CanActivateFn = (route, _state) => {
  const guildId = route.params.guildId;
  const user: User | undefined = route.data['user'];

  const guild = user?.guilds.find(guild => guild.id === guildId);
  return guild && guild.role !== 'user' ? true : inject(Router).parseUrl('/settings');
};

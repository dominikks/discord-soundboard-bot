import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ApiService } from '../services/api.service';

export const guildPermissionGuard: CanActivateFn = (route, _state) => {
  const guildId = route.params.guildId;
  const user = inject(ApiService).user();

  return user?.guilds.find(guild => guild.id === guildId).role !== 'user' ? true : inject(Router).parseUrl('/settings');
};

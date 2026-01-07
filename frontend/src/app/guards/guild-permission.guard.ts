import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { User } from '../services/api.service';

export const guildPermissionGuard: CanActivateFn = (route, _state) => {
  const guildId = route.params.guildId;
  const router = inject(Router);

  // Find user data in route snapshot
  let currentRoute = route.root;
  let user: User | undefined;

  while (currentRoute) {
    if (currentRoute.data['user']) {
      user = currentRoute.data['user'] as User;
      break;
    }

    if (currentRoute.firstChild) {
      currentRoute = currentRoute.firstChild;
    } else {
      break;
    }
  }

  if (!user) {
    return new RedirectCommand(router.parseUrl('/login'));
  }

  const guild = user.guilds.find(g => g.id === guildId);
  return guild && guild.role !== 'user' ? true : new RedirectCommand(router.parseUrl('/settings'));
};

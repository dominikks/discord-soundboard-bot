import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ApiService, User } from '../services/api.service';

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
    // On a direct deep link, canActivate runs before the parent resolver.
    return inject(ApiService)
      .loadUser()
      .pipe(
        map(loadedUser => {
          const guild = loadedUser.guilds.find(g => g.id === guildId);
          return guild && guild.role !== 'user' ? true : new RedirectCommand(router.parseUrl('/settings'));
        }),
        catchError(() => of(new RedirectCommand(router.parseUrl('/login')))),
      );
  }

  const guild = user.guilds.find(g => g.id === guildId);
  return guild && guild.role !== 'user' ? true : new RedirectCommand(router.parseUrl('/settings'));
};

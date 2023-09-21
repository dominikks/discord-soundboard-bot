import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { ApiService } from '../services/api.service';

@Injectable({
  providedIn: 'root',
})
export class GuildPermissionGuard {
  constructor(private apiService: ApiService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot, _state: RouterStateSnapshot) {
    const guildId = route.params.guildId;
    return this.apiService.user$.pipe(
      map(user => (user.guilds.find(guild => guild.id === guildId).role !== 'user' ? true : this.router.parseUrl('/settings')))
    );
  }
}

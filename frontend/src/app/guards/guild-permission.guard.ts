import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';
import { ApiService } from '../services/api.service';

@Injectable({
  providedIn: 'root',
})
export class GuildPermissionGuard implements CanActivate {
  constructor(private apiService: ApiService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot, _state: RouterStateSnapshot) {
    const guildId = route.params.guildId;
    const user = this.apiService.user();

    return user?.guilds.find(guild => guild.id === guildId).role !== 'user' ? true : this.router.parseUrl('/settings');
  }
}

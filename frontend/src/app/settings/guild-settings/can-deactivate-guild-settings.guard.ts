import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CanDeactivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { combineLatest, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { GuildSettingsComponent } from './guild-settings.component';

@Injectable({
  providedIn: 'root',
})
export class CanDeactivateGuildSettingsGuard implements CanDeactivate<GuildSettingsComponent> {
  constructor(private snackBar: MatSnackBar) {}

  canDeactivate(
    component: GuildSettingsComponent,
    _route: ActivatedRouteSnapshot,
    _state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    return combineLatest([
      component.randomInfixesHasChanges$,
      component.randomInfixIsSaving$,
      component.userIsSaving$,
      component.moderatorIsSaving$,
      component.maxVolumeIsSaving$,
      component.meanVolumeIsSaving$,
    ]).pipe(
      map(([rIHasChanges, rISaving, userSaving, modSaving, maxVolSaving, meanVolSaving]) => {
        if (rIHasChanges) {
          this.snackBar.open('You have unsaved changes. Please save or discard them before leaving this component.');
          return false;
        }
        if (userSaving === 'saving' || modSaving === 'saving' || maxVolSaving === 'saving' || meanVolSaving === 'saving' || rISaving) {
          this.snackBar.open('You cannot leave this component while saving');
          return false;
        }

        return true;
      })
    );
  }
}

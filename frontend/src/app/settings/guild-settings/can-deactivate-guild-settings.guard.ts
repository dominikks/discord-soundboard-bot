import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRouteSnapshot, CanDeactivate, RouterStateSnapshot } from '@angular/router';
import { GuildSettingsComponent } from './guild-settings.component';

@Injectable({
  providedIn: 'root',
})
export class CanDeactivateGuildSettingsGuard implements CanDeactivate<GuildSettingsComponent> {
  constructor(private snackBar: MatSnackBar) {}

  canDeactivate(component: GuildSettingsComponent, _route: ActivatedRouteSnapshot, _state: RouterStateSnapshot) {
    if (component.randomInfixesHasChanges()) {
      this.snackBar.open('You have unsaved changes. Please save or discard them before leaving this component.');
      return false;
    }

    if (
      component.userIsSaving() === 'saving' ||
      component.moderatorIsSaving() === 'saving' ||
      component.maxVolumeIsSaving() === 'saving' ||
      component.meanVolumeIsSaving() === 'saving' ||
      component.randomInfixIsSaving()
    ) {
      this.snackBar.open('You cannot leave this component while saving');
      return false;
    }

    return true;
  }
}

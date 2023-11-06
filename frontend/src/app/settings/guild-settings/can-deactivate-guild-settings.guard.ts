import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CanDeactivateFn } from '@angular/router';
import { GuildSettingsComponent } from './guild-settings.component';

export const canDeactivateGuildSettingsGuard: CanDeactivateFn<GuildSettingsComponent> = (component, _route, _state) => {
  const snackBar = inject(MatSnackBar);

  if (component.randomInfixesHasChanges()) {
    snackBar.open('You have unsaved changes. Please save or discard them before leaving this component.');
    return false;
  }

  if (
    component.userIsSaving() === 'saving' ||
    component.moderatorIsSaving() === 'saving' ||
    component.maxVolumeIsSaving() === 'saving' ||
    component.meanVolumeIsSaving() === 'saving' ||
    component.randomInfixIsSaving()
  ) {
    snackBar.open('You cannot leave this component while saving.');
    return false;
  }

  return true;
};

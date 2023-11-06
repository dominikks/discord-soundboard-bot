import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CanDeactivateFn } from '@angular/router';
import { SoundManagerComponent } from './sound-manager.component';

export const canDeactivateSoundManagerGuard: CanDeactivateFn<SoundManagerComponent> = (component, _route, _state) => {
  const snackBar = inject(MatSnackBar);

  if (component.isSaving()) {
    snackBar.open('You cannot leave this component while saving');
    return false;
  }
  if (component.isUploading()) {
    snackBar.open('You cannot leave this component while uploading');
    return false;
  }
  if (component.hasChanges()) {
    snackBar.open('There are sounds with outstanding changes. Please save or discard them before continuing.');
    return false;
  }
  if (component.isProcessing()) {
    snackBar.open('There are sounds currently being processed. Please wait until that is finished.');
    return false;
  }

  return true;
};

import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRouteSnapshot, CanDeactivate, RouterStateSnapshot } from '@angular/router';
import { Observable } from 'rxjs';
import { SoundManagerComponent } from './sound-manager.component';

@Injectable({
  providedIn: 'root',
})
export class CanDeactivateSoundManagerGuard implements CanDeactivate<SoundManagerComponent> {
  constructor(private snackBar: MatSnackBar) {}

  canDeactivate(
    component: SoundManagerComponent,
    _route: ActivatedRouteSnapshot,
    _state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    if (component.isSaving()) {
      this.snackBar.open('You cannot leave this component while saving');
      return false;
    }
    if (component.isUploading()) {
      this.snackBar.open('You cannot leave this component while uploading');
      return false;
    }
    if (component.hasChanges()) {
      this.snackBar.open('There are sounds with outstanding changes. Please save or discard them before continuing.');
      return false;
    }
    if (component.isProcessing()) {
      this.snackBar.open('There are sounds currently being processed. Please wait until that is finished.');
      return false;
    }

    return true;
  }
}

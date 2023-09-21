import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { combineLatest, Observable } from 'rxjs';
import { first, map } from 'rxjs/operators';
import { SoundManagerComponent } from './sound-manager.component';

@Injectable({
  providedIn: 'root',
})
export class CanDeactivateSoundManagerGuard {
  constructor(private snackBar: MatSnackBar) {}

  canDeactivate(
    component: SoundManagerComponent,
    _route: ActivatedRouteSnapshot,
    _state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    return combineLatest([component.isSaving$, component.hasChanges$, component.isProcessing$, component.isUploading$]).pipe(
      first(),
      map(([isSaving, hasChanges, isProcessing, isUploading]) => {
        if (isSaving) {
          this.snackBar.open('You cannot leave this component while saving');
          return false;
        }
        if (isUploading) {
          this.snackBar.open('You cannot leave this component while uploading');
          return false;
        }
        if (hasChanges) {
          this.snackBar.open('There are sounds with outstanding changes. Please save or discard them before continuing.');
          return false;
        }
        if (isProcessing) {
          this.snackBar.open('There are sounds currently being processed. Please wait until that is finished.');
          return false;
        }

        return true;
      })
    );
  }
}

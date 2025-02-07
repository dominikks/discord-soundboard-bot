import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Sound } from 'src/app/services/sounds.service';

@Component({
    templateUrl: './sound-delete-confirm.component.html',
    styleUrls: ['./sound-delete-confirm.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class SoundDeleteConfirmComponent {
  constructor(private dialogRef: MatDialogRef<SoundDeleteConfirmComponent>, @Inject(MAT_DIALOG_DATA) public data: { sound: Sound }) {}

  confirm() {
    this.dialogRef.close(true);
  }

  abort() {
    this.dialogRef.close();
  }
}

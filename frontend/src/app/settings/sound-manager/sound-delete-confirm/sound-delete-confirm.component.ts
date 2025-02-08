import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogTitle, MatDialogContent, MatDialogActions } from '@angular/material/dialog';
import { Sound } from 'src/app/services/sounds.service';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { MatButton } from '@angular/material/button';

@Component({
  templateUrl: './sound-delete-confirm.component.html',
  styleUrls: ['./sound-delete-confirm.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogTitle, CdkScrollable, MatDialogContent, MatDialogActions, MatButton],
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

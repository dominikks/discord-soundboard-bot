import { animate, state, style, transition, trigger } from '@angular/animations';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { NgIf } from '@angular/common';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-unsaved-changes-box',
  templateUrl: './unsaved-changes-box.component.html',
  styleUrls: ['./unsaved-changes-box.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('enterLeave', [
      state('*', style({ transform: 'translateY(0)' })),
      transition(':enter', [style({ transform: 'translateY(100%)' }), animate('200ms ease-out')]),
      transition(':leave', [animate('200ms ease-in', style({ transform: 'translateY(100%)' }))]),
    ]),
  ],
  imports: [NgIf, MatCard, MatCardContent, MatButton, MatProgressSpinner],
})
export class UnsavedChangesBoxComponent {
  @Input({ required: true }) hasChanges: boolean;
  @Input({ required: true }) isSaving: boolean;
  @Input() disabled = false;

  @Output() saveChanges = new EventEmitter<void>();
  @Output() discardChanges = new EventEmitter<void>();
}

import { animate, state, style, transition, trigger } from '@angular/animations';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

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
})
export class UnsavedChangesBoxComponent {
  @Input() hasChanges: boolean;
  @Input() isSaving: boolean;
  @Input() disabled = false;

  @Output() saveChanges = new EventEmitter<void>();
  @Output() discardChanges = new EventEmitter<void>();
}

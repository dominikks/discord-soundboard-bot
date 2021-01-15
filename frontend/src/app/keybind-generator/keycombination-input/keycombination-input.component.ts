import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

export interface KeyCombination {
  key: string;
  isControl: boolean;
  isAlt: boolean;
}

@Component({
  selector: 'app-keycombination-input',
  templateUrl: './keycombination-input.component.html',
  styleUrls: ['./keycombination-input.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeycombinationInputComponent {
  @Input() keycombination: KeyCombination;
  @Output() keycombinationChange = new EventEmitter<void>();

  onKey(event: KeyboardEvent) {
    // Ignore Control, Alt, Shift, Tab, Windows-Key
    if (['Alt', 'Control', 'Shift', 'Tab', 'OS'].includes(event.key)) {
      return;
    }

    this.keycombination.key = event.key.toUpperCase();
    this.keycombination.isAlt = event.altKey;
    this.keycombination.isControl = event.ctrlKey;
    event.preventDefault();
    this.keycombinationChange.emit();
  }
}

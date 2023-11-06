import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

export interface KeyCombination {
  key: string;
  isControl: boolean;
  isAlt: boolean;
}

@Component({
  selector: 'app-key-combination-input',
  templateUrl: './key-combination-input.component.html',
  styleUrls: ['./key-combination-input.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyCombinationInputComponent {
  @Input({ required: true }) keyCombination: KeyCombination;
  @Output() keyCombinationChange = new EventEmitter<KeyCombination>();

  onKey(event: KeyboardEvent) {
    // Ignore Control, Alt, Shift, Tab, Windows-Key
    if (['Alt', 'Control', 'Shift', 'Tab', 'OS'].includes(event.key)) {
      return;
    }

    event.preventDefault();

    const keyCombination: KeyCombination = {
      key: event.key.toUpperCase(),
      isAlt: event.altKey,
      isControl: event.ctrlKey,
    };
    this.keyCombinationChange.emit(keyCombination);
  }
}

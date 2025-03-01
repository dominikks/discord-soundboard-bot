import { ChangeDetectionStrategy, Component, model } from '@angular/core';

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
  imports: [],
})
export class KeyCombinationInputComponent {
  readonly keyCombination = model.required<KeyCombination>();

  onKey(event: KeyboardEvent) {
    // Ignore Control, Alt, Shift, Tab, Windows-Key
    if (['Alt', 'Control', 'Shift', 'Tab', 'OS'].includes(event.key)) {
      return;
    }

    event.preventDefault();

    const updatedCombination: KeyCombination = {
      key: event.key.toUpperCase(),
      isAlt: event.altKey,
      isControl: event.ctrlKey,
    };
    this.keyCombination.set(updatedCombination);
  }
}
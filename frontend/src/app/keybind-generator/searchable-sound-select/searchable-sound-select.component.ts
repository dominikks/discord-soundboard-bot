import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { Sound } from 'src/app/services/sounds.service';
import Fuse from 'fuse.js';
import { KeyCommand } from '../keybind-generator.component';

@Component({
  selector: 'app-searchable-sound-select',
  templateUrl: './searchable-sound-select.component.html',
  styleUrls: ['./searchable-sound-select.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchableSoundSelectComponent implements OnChanges {
  @Input({ required: true }) sounds: Sound[];
  @Input({ required: true }) selectedCommand: KeyCommand;
  @Output() selectedCommandChange = new EventEmitter<KeyCommand>();

  soundsFuse: Fuse<Sound>;
  soundSearchFilter = '';
  filteredSounds: Sound[];

  ngOnChanges(changes: SimpleChanges) {
    if ('sounds' in changes) {
      this.soundsFuse = new Fuse(this.sounds, { keys: ['name'] });
      this.updateFilter();
    }
  }

  updateFilter() {
    if (this.sounds == null) {
      return;
    }

    if (this.soundSearchFilter.length > 0) {
      this.filteredSounds = this.soundsFuse.search(this.soundSearchFilter).map(res => res.item);
    } else {
      this.filteredSounds = this.sounds;
    }
  }

  getSoundName(command: KeyCommand) {
    return command != null && typeof command !== 'string' ? command.name : '';
  }
}

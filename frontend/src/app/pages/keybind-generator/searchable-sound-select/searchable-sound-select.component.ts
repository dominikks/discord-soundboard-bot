import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { Sound } from 'src/app/services/sounds.service';
import Fuse from 'fuse.js';
import { MatSelect, MatSelectTrigger } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatOption } from '@angular/material/core';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatIcon } from '@angular/material/icon';
import { KeyCommand } from '../keybind-generator.component';

@Component({
  selector: 'app-searchable-sound-select',
  templateUrl: './searchable-sound-select.component.html',
  styleUrls: ['./searchable-sound-select.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatSelect, FormsModule, MatOption, NgxMatSelectSearchModule, MatIcon, MatSelectTrigger],
})
export class SearchableSoundSelectComponent {
  readonly sounds = input.required<Sound[]>();
  readonly selectedCommand = model.required<KeyCommand>();

  readonly soundSearchFilter = signal('');

  readonly soundsFuse = computed(() => {
    return new Fuse(this.sounds(), { keys: ['name'] });
  });

  readonly filteredSounds = computed(() => {
    const filter = this.soundSearchFilter();
    const allSounds = this.sounds();

    if (filter.length > 0) {
      return this.soundsFuse()
        .search(filter)
        .map(res => res.item);
    } else {
      return allSounds;
    }
  });

  getSoundName(command: KeyCommand) {
    return command != null && typeof command !== 'string' ? command.name : '';
  }
}

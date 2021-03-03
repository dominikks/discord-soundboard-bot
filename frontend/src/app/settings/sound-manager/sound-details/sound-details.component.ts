import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { SoundEntry } from '../sound-manager.component';

type VolumeAdjustmentMode = 'auto' | 'manual';

@Component({
  selector: 'app-sound-details',
  templateUrl: './sound-details.component.html',
  styleUrls: ['./sound-details.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoundDetailsComponent {
  @Input() soundEntry: SoundEntry;
  @Input() isBusy: boolean;
  @Input() isPlaying: boolean;

  @Output() playClick = new EventEmitter<void>();
  @Output() deleteClick = new EventEmitter<void>();
  @Output() replaceSoundfile = new EventEmitter<File>();

  get sound() {
    return this.soundEntry.sound;
  }

  set volumeAdjustmentMode(mode: VolumeAdjustmentMode) {
    if (mode === 'auto') {
      this.soundEntry.sound.volumeAdjustment = null;
    } else {
      this.soundEntry.sound.volumeAdjustment = 0;
    }
  }
  get volumeAdjustmentMode() {
    return this.soundEntry.sound.volumeAdjustment == null ? 'auto' : 'manual';
  }

  constructor() {}

  onImportFileChange(event: Event) {
    const files = (event.target as HTMLInputElement).files;
    if (files.length === 1) {
      this.replaceSoundfile.emit(files[0]);
    }
  }
}

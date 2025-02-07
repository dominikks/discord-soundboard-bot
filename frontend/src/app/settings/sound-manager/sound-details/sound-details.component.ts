import { ChangeDetectionStrategy, Component, computed, EventEmitter, Input, Output } from '@angular/core';
import { SoundEntry } from '../sound-manager.component';

type VolumeAdjustmentMode = 'auto' | 'manual';

@Component({
    selector: 'app-sound-details',
    templateUrl: './sound-details.component.html',
    styleUrls: ['./sound-details.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class SoundDetailsComponent {
  @Input({ required: true }) soundEntry: SoundEntry;
  @Input({ required: true }) isBusy: boolean;
  @Input({ required: true }) isPlaying: boolean;

  @Output() playClick = new EventEmitter<void>();
  @Output() deleteClick = new EventEmitter<void>();
  @Output() replaceSoundFile = new EventEmitter<File>();

  get sound() {
    return this.soundEntry.sound;
  }

  readonly volumeAdjustmentMode = computed(() => (this.soundEntry.sound().volumeAdjustment == null ? 'auto' : 'manual'));

  updateVolumeAdjustmentMode(mode: VolumeAdjustmentMode) {
    if (mode === 'auto') {
      this.soundEntry.mutateSound({ volumeAdjustment: null });
    } else {
      this.soundEntry.mutateSound({ volumeAdjustment: 0 });
    }
  }

  onImportFileChange(event: Event) {
    const files = (event.target as HTMLInputElement).files;
    if (files.length === 1) {
      this.replaceSoundFile.emit(files[0]);
    }
  }
}

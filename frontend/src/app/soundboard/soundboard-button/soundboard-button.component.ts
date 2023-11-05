import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-soundboard-button',
  templateUrl: './soundboard-button.component.html',
  styleUrls: ['./soundboard-button.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoundboardButtonComponent {
  @Input({ required: true }) guildId: string;
  @Input() category?: string;
  @Input() isLocallyPlaying = false;
  @Output() playRemote = new EventEmitter<void>();
  @Output() playLocal = new EventEmitter<void>();
  @Output() stopLocal = new EventEmitter<void>();

  get displayedCategory() {
    return this.category == null || this.category === '' ? '' : `/${this.category}`;
  }

  playSound(local = false) {
    if (local) {
      this.playLocal.emit();
    } else {
      this.playRemote.emit();
    }
  }

  handleLocalSound() {
    if (this.isLocallyPlaying) {
      this.stopLocal.emit();
    } else {
      this.playSound(true);
    }
  }
}

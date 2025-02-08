import { ChangeDetectionStrategy, Component, computed, EventEmitter, Input, Output } from '@angular/core';
import { SoundEntry } from '../sound-manager.component';
import {
  MatExpansionPanel,
  MatExpansionPanelHeader,
  MatExpansionPanelTitle,
  MatExpansionPanelDescription,
  MatExpansionPanelContent,
  MatExpansionPanelActionRow,
} from '@angular/material/expansion';
import { DecimalPipe, DatePipe } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatSelect } from '@angular/material/select';
import { MatOption } from '@angular/material/core';
import { MatDivider } from '@angular/material/divider';
import { TimeagoModule } from 'ngx-timeago';
import { MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

type VolumeAdjustmentMode = 'auto' | 'manual';

@Component({
  selector: 'app-sound-details',
  templateUrl: './sound-details.component.html',
  styleUrls: ['./sound-details.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    MatIcon,
    MatTooltip,
    MatExpansionPanelDescription,
    MatExpansionPanelContent,
    MatFormField,
    MatLabel,
    MatInput,
    FormsModule,
    MatSelect,
    MatOption,
    MatSuffix,
    MatDivider,
    TimeagoModule,
    MatExpansionPanelActionRow,
    MatButton,
    MatProgressSpinner,
    DecimalPipe,
    DatePipe,
  ],
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

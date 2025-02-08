import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import { NgIf } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { GuildNamePipe } from '../../guild-name.pipe';

@Component({
  selector: 'app-soundboard-button',
  templateUrl: './soundboard-button.component.html',
  styleUrls: ['./soundboard-button.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatTooltip, NgIf, MatIconButton, MatIcon, GuildNamePipe],
})
export class SoundboardButtonComponent implements AfterViewInit {
  @Input({ required: true }) guildId: string;
  @Input() category?: string;
  @Input() isLocallyPlaying = false;
  @Input() canPlayLocally = true;
  @Output() playRemote = new EventEmitter<void>();
  @Output() playLocal = new EventEmitter<void>();
  @Output() stopLocal = new EventEmitter<void>();

  @ViewChild('soundName') nameLabel: ElementRef;

  get displayedCategory() {
    return this.category == null || this.category === '' ? '' : `/${this.category}`;
  }

  ngAfterViewInit() {
    this.setLabelMinWidthToFitContent();
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

  setLabelMinWidthToFitContent() {
    const label = this.nameLabel.nativeElement;
    label.style.whiteSpace = 'nowrap';
    const computedStyle = window.getComputedStyle(label);
    const horizontalPadding = parseFloat(computedStyle.paddingLeft) + parseFloat(computedStyle.paddingRight);
    const singleLineWidth = label.clientWidth - horizontalPadding;

    // subtract all paddings/margins from viewport width; this gets the maximum width, the label can have
    const cssMaxWidth = 'calc(100vw - 72px - 16px - 16px - 10px)';

    label.style.minWidth = `min(${singleLineWidth / 2 + horizontalPadding + 50}px, ${cssMaxWidth})`;
    label.style.whiteSpace = null;
  }
}

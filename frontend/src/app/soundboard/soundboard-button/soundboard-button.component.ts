import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-soundboard-button',
  templateUrl: './soundboard-button.component.html',
  styleUrls: ['./soundboard-button.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoundboardButtonComponent {
  @Input() guildId: string;
  @Input() category?: string;

  get dispCategory() {
    return this.category == null || this.category === '' ? '' : `/${this.category}`;
  }
}

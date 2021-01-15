import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-soundboard-button',
  templateUrl: './soundboard-button.component.html',
  styleUrls: ['./soundboard-button.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoundboardButtonComponent {
  @Input() category?: string;
}

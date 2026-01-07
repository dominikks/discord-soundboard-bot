import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';
import { DatePipe } from '@angular/common';
import { AppInfoState } from '../../services/app-info.state';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTooltip, DatePipe],
})
export class FooterComponent {
  protected appInfoState = inject(AppInfoState);

  get info() {
    return this.appInfoState.data();
  }
}

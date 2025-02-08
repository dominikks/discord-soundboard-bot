import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ApiService } from '../services/api.service';
import { MatTooltip } from '@angular/material/tooltip';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTooltip, DatePipe],
})
export class FooterComponent {
  private apiService = inject(ApiService);

  get info() {
    return this.apiService.appInfo();
  }
}

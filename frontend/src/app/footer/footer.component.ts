import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ApiService } from '../services/api.service';

@Component({
    selector: 'app-footer',
    templateUrl: './footer.component.html',
    styleUrls: ['./footer.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class FooterComponent {
  get info() {
    return this.apiService.appInfo();
  }

  constructor(private apiService: ApiService) {}
}

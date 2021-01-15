import { Component } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { TimeagoIntl } from 'ngx-timeago';
import { strings as germanStrings } from 'ngx-timeago/language-strings/de';
import { ApiService } from './services/api.service';
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  state: 'loading' | 'finished' | 'error' = 'loading';

  constructor(private intl: TimeagoIntl, apiService: ApiService, title: Title) {
    this.intl.strings = germanStrings;
    apiService
      .loadAppInfo()
      .then(info => {
        this.state = 'finished';
        title.setTitle((info.title + ' Soundboard').trim());
      })
      .catch(error => {
        this.state = 'error';
        console.error(error);
      });
  }
}

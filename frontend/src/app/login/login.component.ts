import { Component } from '@angular/core';
import { ApiService } from '../services/api.service';
import { MatCard } from '@angular/material/card';
import { MatAnchor } from '@angular/material/button';
import { FooterComponent } from '../footer/footer.component';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  imports: [MatCard, MatAnchor, FooterComponent],
})
export class LoginComponent {
  constructor(protected apiService: ApiService) {}
}

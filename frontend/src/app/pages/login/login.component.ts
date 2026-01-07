import { Component } from '@angular/core';
import { MatCard } from '@angular/material/card';
import { MatAnchor } from '@angular/material/button';
import { FooterComponent } from '../../common/footer/footer.component';

@Component({
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  imports: [MatCard, MatAnchor, FooterComponent],
})
export class LoginComponent {}

import { Component } from '@angular/core';
import { Router } from '@angular/router';

// Angular Material
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

// Forms
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent {

  phoneNumber = '+55 (19) 97107-6785';
  username = '';
  password = '';
  error = false;

  constructor(private router: Router) { }

  login() {
    if (this.username === 'admin' && this.password === 'admin') {
      localStorage.setItem('auth', 'true');
      this.router.navigate(['/home']);
    } else {
      this.error = true;
    }
  }
}
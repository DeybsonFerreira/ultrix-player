import { Component, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('ultrix-tv');

  constructor(private router: Router) {
    this.checkAuth();
  }

  checkAuth() {
    const isLogged = localStorage.getItem('auth');

    if (!isLogged) {
      this.router.navigate(['/']);
    }
  }
}

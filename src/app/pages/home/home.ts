import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { ConfigDialogComponent } from '../config/config-dialog/config-dialog';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-home',
  imports: [CommonModule, MatButtonModule],
  standalone: true,
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomeComponent {

  constructor(private router: Router, private dialog: MatDialog) { }

  goLive() {
    this.router.navigate(['/live']);
  }

  openConfig() {
    this.dialog.open(ConfigDialogComponent, {
      panelClass: 'ultrix-dialog'
    });
  }
}

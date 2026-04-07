import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { menu } from '../../models/menu';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterModule } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class NavbarComponent {

  @Output() searchEvent = new EventEmitter<string>();
  constructor() { }

  // Itens do menu
  menuItems: menu[] = [
    { label: 'Início', id: 'home', actionLink: '/' },
    { label: 'Canais', id: 'live', actionLink: '/live' },
    { label: 'Filmes', id: 'movies', actionLink: '/movies' },
    { label: 'Séries', id: 'series', actionLink: '/series' },
  ];

  activeIdItem: string = 'home';

  setActive(id: string) {
    this.activeIdItem = id;
  }

  onTyping(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.searchEvent.emit(value);
  }
}

import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { menu } from '../../models/menu';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class NavbarComponent {

  @Output() searchEvent = new EventEmitter<string>();

  // Itens do menu
  menuItems: menu[] = [
    { label: 'Início', id: 'home' },
    { label: 'Canais', id: 'channels' },
    { label: 'Filmes', id: 'movies' },
    { label: 'Séries', id: 'series' }
  ];

  // Controla qual item está ativo
  activeIdItem: string = 'home';

  setActive(id: string) {
    this.activeIdItem = id;
  }

  onTyping(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.searchEvent.emit(value);
  }
}

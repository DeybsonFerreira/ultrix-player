import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  QueryList,
  ViewChildren
} from '@angular/core';
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
export class HomeComponent implements AfterViewInit {

  @ViewChildren('menuCard') private menuCards!: QueryList<ElementRef<HTMLElement>>;

  constructor(private router: Router, private dialog: MatDialog) { }

  ngAfterViewInit(): void {
    setTimeout(() => this.focusCardByIndex(0), 0);
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    this.focusActiveOrDefaultCard();
  }

  @HostListener('document:keydown', ['$event'])
  onRemoteKeydown(event: KeyboardEvent): void {
    if (!this.shouldHandleRemoteKey(event)) return;

    switch (event.key) {
      case 'ArrowRight':
        this.moveFocus(1);
        break;
      case 'ArrowLeft':
        this.moveFocus(-1);
        break;
      case 'ArrowDown':
        this.moveFocus(this.getGridCols());
        break;
      case 'ArrowUp':
        this.moveFocus(-this.getGridCols());
        break;
      case 'Enter':
      case ' ':
        this.activateFocusedCard();
        break;
      default:
        return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  goLive() { this.router.navigate(['/live']); }
  goMovies() { this.router.navigate(['/movies']); }
  goSeries() { this.router.navigate(['/series']); }

  openConfig() {
    this.dialog.open(ConfigDialogComponent, {
      panelClass: 'ultrix-dialog'
    });
  }

  private shouldHandleRemoteKey(event: KeyboardEvent): boolean {
    if (event.altKey || event.ctrlKey || event.metaKey) return false;

    const supportedKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '];
    if (!supportedKeys.includes(event.key)) return false;

    const target = event.target as HTMLElement | null;
    if (!target) return true;

    const tag = target.tagName.toLowerCase();
    return !(tag === 'input' || tag === 'textarea' || target.isContentEditable);
  }

  private getCardElements(): HTMLElement[] {
    return this.menuCards?.toArray().map(item => item.nativeElement) ?? [];
  }

  private getGridCols(): number {
    return window.innerWidth <= 1000 ? 2 : 4;
  }

  private getActiveCardIndex(): number {
    const cards = this.getCardElements();
    const active = document.activeElement as HTMLElement | null;
    const idx = cards.findIndex(card => card === active);
    return idx >= 0 ? idx : 0;
  }

  private moveFocus(offset: number): void {
    const cards = this.getCardElements();
    if (cards.length === 0) return;

    const current = this.getActiveCardIndex();
    const next = Math.max(0, Math.min(cards.length - 1, current + offset));
    this.focusCardByIndex(next);
  }

  private focusCardByIndex(index: number): void {
    const cards = this.getCardElements();
    cards[index]?.focus();
  }

  private activateFocusedCard(): void {
    const cards = this.getCardElements();
    const active = document.activeElement as HTMLElement | null;
    const idx = cards.findIndex(card => card === active);

    if (idx >= 0) {
      cards[idx].click();
      return;
    }

    this.focusCardByIndex(0);
  }

  private focusActiveOrDefaultCard(): void {
    const cards = this.getCardElements();
    if (cards.length === 0) return;

    const active = document.activeElement as HTMLElement | null;
    const hasActiveCard = cards.some(card => card === active);
    if (!hasActiveCard) this.focusCardByIndex(0);
  }
}

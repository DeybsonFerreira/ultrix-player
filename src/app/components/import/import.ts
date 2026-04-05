import { ChangeDetectorRef, Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IptvService } from '../../services/iptv-service';

@Component({
  selector: 'app-import',
  imports: [CommonModule, FormsModule],
  templateUrl: './import.html',
  styleUrl: './import.scss',
})
export class ImportComponent {

  // Import
  m3uUrl: string = '';
  isLoading: boolean = false;
  importError: string = '';
  importSuccess: string = '';

  constructor(
    private router: Router,
    private iptv: IptvService,
    private cdr: ChangeDetectorRef
  ) { }

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  // ─── IMPORT M3U ────────────────────────────────────────
  triggerFileInput() {
    this.fileInputRef.nativeElement.click();
  }

  async importFromUrl() {
    if (!this.m3uUrl.trim()) { this.importError = 'Informe uma URL válida.'; return; }

    this.isLoading = true;
    this.importError = '';
    this.importSuccess = '';

    try {
      const res = await fetch(this.m3uUrl.trim());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.processM3UContent(await res.text());
    } catch {
      this.importError = 'Não foi possível carregar a URL. Use o arquivo local.';
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  processM3UContent(content: string) {
    const result = this.iptv.parseM3U(content);

    if (!result.ok) {
      this.importError = result.error!;
      this.isLoading = false;
      this.cdr.detectChanges();
      return;
    }

    const liveCount = this.iptv.getCount('live');
    const movieCount = this.iptv.getCount('movie');
    const seriesCount = this.iptv.getCount('series');

    this.importSuccess =
      `${result.total} itens importados: ` +
      `📺 ${liveCount} canais · 🎬 ${movieCount} filmes · 📺 ${seriesCount} séries`;

    this.isLoading = false;

    setTimeout(() => {
      this.cdr.detectChanges();
    }, 1500);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.isLoading = true;
    this.importError = '';
    this.importSuccess = '';

    const reader = new FileReader();
    reader.onload = (e) => this.processM3UContent(e.target?.result as string);
    reader.onerror = () => {
      this.importError = 'Erro ao ler o arquivo.';
      this.isLoading = false;
      this.cdr.detectChanges();
    };
    reader.readAsText(file);
  }

  goHome() {
    this.router.navigate(['/']);
  }
}

import { AfterViewInit, ChangeDetectorRef, Component, ViewChild, ElementRef } from '@angular/core';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';

import { appConfig } from '../../../models/appConfig';
import { ConfigService } from '../../../services/config-service';
import { IptvService } from '../../../services/iptv-service';
import { DexieService } from '../../../services/dexie-service';
import { db, PlaylistData } from '../../../models/db';
import { MessageService } from '../../../services/message-service';

@Component({
  selector: 'app-config-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatInputModule,
    MatButtonModule,
    MatListModule,
    MatIconModule
  ],
  templateUrl: './config-dialog.html',
  styleUrl: './config-dialog.scss',
})
export class ConfigDialogComponent implements AfterViewInit {
  @ViewChild('urlInput') urlInput!: ElementRef;

  m3uUrl: string = 'https://iptv-org.github.io/iptv/index.m3u';
  isLoading: boolean = false;
  importError: string = '';
  importSuccess: string = '';
  config: appConfig;
  servers: PlaylistData[] = [];
  selectedFileName: string = '';

  constructor(
    private dialogRef: MatDialogRef<ConfigDialogComponent>,
    private configService: ConfigService,
    private iptv: IptvService,
    private cdr: ChangeDetectorRef,
    private dexie: DexieService,
    private message: MessageService
  ) {
    this.config = this.configService.getConfig();
  }

  async ngAfterViewInit() {
    this.setInitialFocus();
    await this.loadServers();
  }

  private setInitialFocus() {
    // Timeout ligeiramente maior para garantir renderização em TVs mais lentas
    setTimeout(() => {
      this.urlInput?.nativeElement?.focus();
    }, 400);
  }

  async importFromUrl() {
    const cleanUrl = this.m3uUrl?.trim();

    if (!cleanUrl || !cleanUrl.startsWith('http')) {
      this.importError = 'Por favor, insira uma URL válida (http/https).';
      return;
    }

    this.isLoading = true;
    this.importError = '';
    this.importSuccess = '';

    try {
      const res = await fetch(cleanUrl);
      if (!res.ok) throw new Error(`Erro na conexão: ${res.status}`);

      const content = await res.text();

      // Validação básica de cabeçalho M3U
      if (!content.includes('#EXTM3U')) {
        throw new Error('O link informado não é uma lista M3U válida.');
      }

      const parseResult = await this.iptv.parseM3U(content);

      if (parseResult.ok) {
        await this.dexie.saveToDatabaseDexie(content);
        this.showSuccessMessage(parseResult);
        await this.loadServers();
      } else {
        this.importError = parseResult.error || 'Erro ao processar lista.';
      }

    } catch (err: any) {
      this.importError = err.message || 'Falha ao carregar URL.';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private showSuccessMessage(result: any) {
    const counts = {
      live: this.iptv.getCount('live'),
      movie: this.iptv.getCount('movie'),
      series: this.iptv.getCount('series')
    };

    this.importSuccess = `✅ ${result.total} itens: ${counts.live} TV, ${counts.movie} Filmes, ${counts.series} Séries`;
  }

  async loadServers() {
    const result = await this.dexie.getPlaylistFromDexie();
    if (result.ok) {
      result.data.forEach(a => a.content = 'hide')
      this.servers = result.data;
    }
    this.cdr.detectChanges();
  }

  async selectServerActive(server: PlaylistData) {
    if (server.active) {
      this.message.error('Este servidor já está ativo');
      return;
    }

    try {
      // Desativa todos e ativa o selecionado (Transação atômica idealmente)
      await db.playlists.filter(playlist => playlist.active === true).modify({ active: false });
      await db.playlists.update(server.id!, { active: true });

      this.message.success('Servidor alterado com sucesso');
      await this.loadServers();
    } catch (err) {
      this.message.error('Erro ao trocar de servidor');
    }
  }

  async removeServer(server: PlaylistData) {
    if (confirm('Deseja remover este servidor?')) {
      await this.dexie.removeById(server.id!);
      await this.loadServers();
    }
  }

  async onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (!file) return;

    this.selectedFileName = file.name;
    this.isLoading = true;
    this.importError = '';
    this.importSuccess = '';

    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try {
        const content = e.target.result;

        if (!content.includes('#EXTM3U')) {
          throw new Error('O arquivo não é uma lista M3U válida.');
        }

        const parseResult = await this.iptv.parseM3U(content);

        if (parseResult.ok) {
          await this.dexie.saveToDatabaseDexie(content);
          this.showSuccessMessage(parseResult);
          await this.loadServers();
        } else {
          this.importError = parseResult.error || 'Erro ao processar arquivo.';
        }
      } catch (err: any) {
        this.importError = err.message || 'Erro ao ler arquivo.';
      } finally {
        this.isLoading = false;
        event.target.value = ''; // Limpa o input
        this.cdr.detectChanges();
      }
    };

    reader.onerror = () => {
      this.importError = 'Falha ao ler arquivo do disco.';
      this.isLoading = false;
      this.cdr.detectChanges();
    };

    reader.readAsText(file);
  }

  close() {
    this.dialogRef.close();
  }
}
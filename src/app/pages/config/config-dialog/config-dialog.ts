import { AfterViewInit, ChangeDetectorRef, Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { appConfig } from '../../../models/appConfig';
import { ConfigService } from '../../../services/config-service';
import { MatDialogModule } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { IptvService } from '../../../services/iptv-service';
import { CommonModule } from '@angular/common';
import { Constants } from '../../../models/constants';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { DexieService } from '../../../services/dexie-service';
import { db, PlaylistData } from '../../../models/db';
import { MessageService } from '../../../services/message-service';



@Component({
  selector: 'app-config-dialog',
  imports: [FormsModule, CommonModule, MatDialogModule, MatInputModule, MatButtonModule, MatListModule, MatIconModule],
  templateUrl: './config-dialog.html',
  styleUrl: './config-dialog.scss',
})
export class ConfigDialogComponent implements AfterViewInit {

  // Import
  m3uUrl: string = 'https://iptv-org.github.io/iptv/index.m3u';
  isLoading: boolean = false;
  importError: string = '';
  importSuccess: string = '';
  config: appConfig;
  servers: PlaylistData[] = [];

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
    this.focoOnInput();
    await this.loadServers();
  }

  focoOnInput() {
    setTimeout(() => {
      document.querySelector('input')?.focus();
    }, 100);
  }

  async importFromUrl() {
    if (!this.m3uUrl.trim()) {
      this.importError = 'Informe uma URL válida.';
      return;
    }

    this.isLoading = true;
    this.importError = '';
    this.importSuccess = '';


    try {
      const res = await fetch(this.m3uUrl.trim());

      if (!res.ok)
        throw new Error(`HTTP ${res.status}`);

      let result = await res.text();
      await this.processM3UContent(result);
      await this.dexie.saveToDatabaseDexie(result);


    } catch {
      this.importError = 'Não foi possível carregar a URL. Use o arquivo local.';
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  async processM3UContent(content: string) {

    const result = await this.iptv.parseM3U(content);

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

  save() {
    this.configService.saveLogin(this.config);
    this.dialogRef.close();
  }

  close() {
    this.dialogRef.close();
  }


  async loadServers() {

    this.servers = [];
    const serverResult = await this.dexie.getPlaylistFromDexie();

    if (serverResult.ok) {

      serverResult.data.forEach(item => {
        let serverName = `${Constants.serverNameText}${item.id}`;
        item.content = serverName;
        this.servers.push(item);
      });
    }
    this.cdr.detectChanges();
  }

  async removeServer(server: PlaylistData) {
    if (server?.id) {
      await this.dexie.removeById(server?.id);
      this.loadServers();
    }
  }

  async selectServerActive(server: PlaylistData) {
    const currentActive = await db.playlists.filter(playlist => playlist.active === true).first();
    if (currentActive?.id == server?.id) {
      this.message.error('Já selecionado');
      return;
    }
    if (currentActive)
      await db.playlists.update(currentActive?.id, { active: false });

    await db.playlists.update(server?.id, { active: true });
    await this.loadServers();
  }





}
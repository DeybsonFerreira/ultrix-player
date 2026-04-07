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
import { CacheKeys } from '../../../models/constants';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';



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
  servers: string[] = [];

  ngAfterViewInit() {
    setTimeout(() => {
      document.querySelector('input')?.focus();
    }, 100);
  }

  constructor(
    private dialogRef: MatDialogRef<ConfigDialogComponent>,
    private configService: ConfigService,
    private iptv: IptvService,
    private cdr: ChangeDetectorRef
  ) {
    this.config = this.configService.getConfig();
    this.loadServers();
  }

  save() {
    this.configService.saveLogin(this.config);
    this.dialogRef.close();
  }

  close() {
    this.dialogRef.close();
  }

  removeServer(serverName: string) {
    const key = serverName.replace('Servidor ', CacheKeys.IPTV_LINK).replace(' #', '_');

    this.iptv.clearStorage(key).then(() => {
      this.servers = this.servers.filter(s => s !== serverName);
      this.cdr.detectChanges();
    });

  }
  async importFromUrl() {
    if (!this.m3uUrl.trim()) { this.importError = 'Informe uma URL válida.'; return; }

    this.isLoading = true;
    this.importError = '';
    this.importSuccess = '';


    try {
      const res = await fetch(this.m3uUrl.trim());

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.processM3UContent(await res.text(), this.m3uUrl.trim(), CacheKeys.IPTV_LINK);
    } catch {
      this.importError = 'Não foi possível carregar a URL. Use o arquivo local.';
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  loadServers() {
    for (let i = 0; i < 3; i++) {
      let key = CacheKeys.IPTV_LINK;

      if (i != 0)
        key = `${CacheKeys.IPTV_LINK}_${i + 1}`;

      this.iptv.loadStorage(key).then((result) => {
        if (result) {
          this.servers.push(key.replace(CacheKeys.IPTV_LINK, 'Servidor ').replace('_', ' #'));
        }
      });
    }
  }

  processM3UContent(content: string, storageValue: string, storageKey: string) {
    console.log(content)
    const result = this.iptv.parseM3U(content, storageKey, storageValue);

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

}
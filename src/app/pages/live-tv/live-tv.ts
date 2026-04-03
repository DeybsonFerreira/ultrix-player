import { ChangeDetectorRef, Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

export interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group: string;
  tvgId?: string;
}

export interface ChannelGroup {
  name: string;
  channels: Channel[];
  expanded?: boolean;
}

@Component({
  selector: 'app-live-tv',
  templateUrl: './live-tv.html',
  styleUrl: './live-tv.scss',
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class LiveTvComponent implements OnInit, OnDestroy {

  @ViewChild('videoPlayer') videoPlayerRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  // Estado da UI
  viewMode: 'import' | 'player' = 'import';
  sidebarMode: 'groups' | 'channels' = 'groups';

  // Dados
  allChannels: Channel[] = [];
  groups: ChannelGroup[] = [];
  selectedGroup: ChannelGroup | null = null;
  selectedChannel: Channel | null = null;
  searchQuery: string = '';

  // Import
  m3uUrl: string = '';
  isLoading: boolean = false;
  importError: string = '';
  importSuccess: string = '';

  // Player
  isPlaying: boolean = false;
  playerError: string = '';
  currentTime: string = '00:00';
  volume: number = 80;
  isMuted: boolean = false;
  private hls: any = null;
  private clockInterval: any;

  constructor(private router: Router, private cdr: ChangeDetectorRef) { }

  ngOnInit(): void {
    this.loadSavedChannels();
    this.startClock();
  }

  ngOnDestroy(): void {
    this.destroyPlayer();
    if (this.clockInterval) clearInterval(this.clockInterval);
  }

  // ─── RELÓGIO ───────────────────────────────────────────
  startClock() {
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
  }

  updateClock() {
    const now = new Date();
    this.currentTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    this.cdr.detectChanges();
  }

  // ─── NAVEGAÇÃO ─────────────────────────────────────────
  goHome() {
    this.router.navigate(['/']);
  }

  // ─── IMPORT M3U ────────────────────────────────────────
  triggerFileInput() {
    this.fileInputRef.nativeElement.click();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.isLoading = true;
    this.importError = '';
    this.importSuccess = '';

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      this.parseM3U(content);
    };
    reader.onerror = () => {
      this.importError = 'Erro ao ler o arquivo.';
      this.isLoading = false;
      this.cdr.detectChanges();
    };
    reader.readAsText(file);
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
      const response = await fetch(this.m3uUrl.trim());
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      this.parseM3U(text);
    } catch (err: any) {
      this.importError = 'Não foi possível carregar a URL. Verifique o endereço ou use o arquivo local.';
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  parseM3U(content: string) {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l);
    const channels: Channel[] = [];

    if (!lines[0]?.startsWith('#EXTM3U')) {
      this.importError = 'Arquivo inválido. Certifique-se que é uma playlist M3U.';
      this.isLoading = false;
      this.cdr.detectChanges();
      return;
    }

    let i = 1;
    while (i < lines.length) {
      const line = lines[i];

      if (line.startsWith('#EXTINF')) {
        const nameMatch = line.match(/,(.+)$/);
        const groupMatch = line.match(/group-title="([^"]*)"/i);
        const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
        const tvgIdMatch = line.match(/tvg-id="([^"]*)"/i);

        const name = nameMatch?.[1]?.trim() || 'Canal sem nome';
        const group = groupMatch?.[1]?.trim() || 'Sem categoria';
        const logo = logoMatch?.[1]?.trim() || '';
        const tvgId = tvgIdMatch?.[1]?.trim() || '';

        // Próxima linha não-comentário é a URL
        let url = '';
        let j = i + 1;
        while (j < lines.length && lines[j].startsWith('#')) j++;
        if (j < lines.length) {
          url = lines[j];
          i = j + 1;
        } else {
          i++;
        }

        if (url && !url.startsWith('#')) {
          channels.push({
            id: `ch_${channels.length}`,
            name,
            url,
            logo,
            group,
            tvgId
          });
        }
      } else {
        i++;
      }
    }

    if (channels.length === 0) {
      this.importError = 'Nenhum canal encontrado na playlist.';
      this.isLoading = false;
      this.cdr.detectChanges();
      return;
    }

    this.allChannels = channels;
    this.buildGroups();
    this.saveChannels();

    this.importSuccess = `${channels.length} canais importados com sucesso!`;
    this.isLoading = false;

    setTimeout(() => {
      this.viewMode = 'player';
      this.cdr.detectChanges();
    }, 1200);
  }

  buildGroups() {
    const map = new Map<string, Channel[]>();
    for (const ch of this.allChannels) {
      if (!map.has(ch.group)) map.set(ch.group, []);
      map.get(ch.group)!.push(ch);
    }
    this.groups = Array.from(map.entries()).map(([name, channels]) => ({
      name,
      channels,
      expanded: false
    }));
  }

  // ─── PERSISTÊNCIA ──────────────────────────────────────
  saveChannels() {
    try {
      localStorage.setItem('ultrix_channels', JSON.stringify(this.allChannels));
    } catch { }
  }

  loadSavedChannels() {
    try {
      const saved = localStorage.getItem('ultrix_channels');
      if (saved) {
        this.allChannels = JSON.parse(saved);
        this.buildGroups();
        if (this.allChannels.length > 0) {
          this.viewMode = 'player';
        }
      }
    } catch { }
  }

  clearPlaylist() {
    localStorage.removeItem('ultrix_channels');
    this.allChannels = [];
    this.groups = [];
    this.selectedGroup = null;
    this.selectedChannel = null;
    this.viewMode = 'import';
    this.sidebarMode = 'groups';
    this.destroyPlayer();
    this.m3uUrl = '';
    this.importError = '';
    this.importSuccess = '';
  }

  // ─── SIDEBAR ───────────────────────────────────────────
  get filteredChannels(): Channel[] {
    if (!this.selectedGroup) return [];
    if (!this.searchQuery) return this.selectedGroup.channels;
    const q = this.searchQuery.toLowerCase();
    return this.selectedGroup.channels.filter(c => c.name.toLowerCase().includes(q));
  }

  selectGroup(group: ChannelGroup) {
    this.selectedGroup = group;
    this.sidebarMode = 'channels';
    this.searchQuery = '';
  }

  backToGroups() {
    this.sidebarMode = 'groups';
    this.selectedGroup = null;
    this.searchQuery = '';
  }

  selectChannel(channel: Channel) {
    this.selectedChannel = channel;
    this.playerError = '';
    setTimeout(() => this.playChannel(channel), 100);
  }

  // ─── PLAYER ────────────────────────────────────────────
  async playChannel(channel: Channel) {
    this.destroyPlayer();
    const video = this.videoPlayerRef?.nativeElement;
    if (!video) return;

    this.isPlaying = false;
    this.playerError = '';

    const url = channel.url;

    // Detecta HLS
    if (url.includes('.m3u8') || url.includes('hls')) {
      await this.playHls(video, url);
    } else {
      video.src = url;
      video.load();
      video.play().then(() => {
        this.isPlaying = true;
        this.cdr.detectChanges();
      }).catch(() => {
        this.playerError = 'Não foi possível reproduzir este canal.';
        this.cdr.detectChanges();
      });
    }
  }

  async playHls(video: HTMLVideoElement, url: string) {
    // Tenta carregar hls.js dinamicamente
    if ((window as any).Hls) {
      this.initHls(video, url, (window as any).Hls);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js';
    script.onload = () => {
      this.initHls(video, url, (window as any).Hls);
    };
    script.onerror = () => {
      // fallback para native
      video.src = url;
      video.play().catch(() => {
        this.playerError = 'Erro ao carregar o canal.';
        this.cdr.detectChanges();
      });
    };
    document.head.appendChild(script);
  }

  // initHls(video: HTMLVideoElement, url: string, HlsLib: any) {
  //   if (HlsLib.isSupported()) {
  //     this.hls = new HlsLib();
  //     this.hls.loadSource(url);
  //     this.hls.attachMedia(video);
  //     this.hls.on(HlsLib.Events.MANIFEST_PARSED, () => {
  //       video.play().then(() => {
  //         this.isPlaying = true;
  //         this.cdr.detectChanges();
  //       });
  //     });
  //     this.hls.on(HlsLib.Events.ERROR, (_: any, data: any) => {
  //       if (data.fatal) {
  //         this.playerError = 'Erro ao reproduzir o canal HLS.';
  //         this.isPlaying = false;
  //         this.cdr.detectChanges();
  //       }
  //     });
  //   } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
  //     video.src = url;
  //     video.play();
  //   }
  // }

  initHls(video: HTMLVideoElement, url: string, HlsLib: any) {
    if (this.hls) { this.hls.destroy(); }

    this.hls = new HlsLib({
      enableWorker: true,
      xhrSetup: (xhr: any) => {
        // Tente forçar o envio de credenciais se necessário
        // xhr.withCredentials = true; 
      },
      // Tenta recuperar automaticamente de erros de rede
      manifestLoadingMaxRetry: 4,
      levelLoadingMaxRetry: 4
    });

    this.hls.loadSource(url);
    this.hls.attachMedia(video);

    this.hls.on(HlsLib.Events.MANIFEST_PARSED, () => {
      video.play().catch(e => {
        console.error("Erro ao dar play:", e);
        this.playerError = 'Erro ao iniciar reprodução automática.';
      });
      this.isPlaying = true;
      this.cdr.detectChanges();
    });

    this.hls.on(HlsLib.Events.ERROR, (event: any, data: any) => {
      if (data.fatal) {
        switch (data.type) {
          case HlsLib.ErrorTypes.NETWORK_ERROR:
            this.playerError = "Erro de rede. Verifique o link.";
            this.hls.startLoad(); // Tenta recarregar
            break;
          case HlsLib.ErrorTypes.MEDIA_ERROR:
            this.playerError = "Erro de mídia. Tentando recuperar...";
            this.hls.recoverMediaError();
            break;
          default:
            this.playerError = "Erro fatal no player HLS.";
            this.destroyPlayer();
            break;
        }
        this.cdr.detectChanges();
      }
    });
  }
  destroyPlayer() {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (this.videoPlayerRef?.nativeElement) {
      const v = this.videoPlayerRef.nativeElement;
      v.pause();
      v.src = '';
      v.load();
    }
    this.isPlaying = false;
  }

  togglePlay() {
    const video = this.videoPlayerRef?.nativeElement;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => { this.isPlaying = true; this.cdr.detectChanges(); });
    } else {
      video.pause();
      this.isPlaying = false;
    }
  }

  toggleMute() {
    const video = this.videoPlayerRef?.nativeElement;
    if (!video) return;
    this.isMuted = !this.isMuted;
    video.muted = this.isMuted;
  }

  setVolume(event: Event) {
    const input = event.target as HTMLInputElement;
    this.volume = +input.value;
    const video = this.videoPlayerRef?.nativeElement;
    if (video) {
      video.volume = this.volume / 100;
      this.isMuted = this.volume === 0;
    }
  }

  nextChannel() {
    if (!this.selectedGroup || !this.selectedChannel) return;
    const list = this.filteredChannels;
    const idx = list.findIndex(c => c.id === this.selectedChannel!.id);
    if (idx < list.length - 1) this.selectChannel(list[idx + 1]);
  }

  prevChannel() {
    if (!this.selectedGroup || !this.selectedChannel) return;
    const list = this.filteredChannels;
    const idx = list.findIndex(c => c.id === this.selectedChannel!.id);
    if (idx > 0) this.selectChannel(list[idx - 1]);
  }
}
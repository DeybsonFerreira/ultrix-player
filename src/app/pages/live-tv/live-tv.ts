import { ChangeDetectorRef, Component, OnInit, OnDestroy, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavbarComponent } from '../../components/navbar/navbar';
import { Channel } from '../../models/channel';
import { ChannelGroup } from '../../models/channelGroup';
import { IptvService } from '../../services/iptv-service';
import { HLS_CONFIG } from '../../models/hls.config';
import { PlayerService } from '../../services/player-service';

@Component({
    selector: 'app-live-tv',
    templateUrl: './live-tv.html',
    styleUrl: './live-tv.scss',
    standalone: true,
    imports: [CommonModule, FormsModule, NavbarComponent]
})
export class LiveTvComponent implements OnInit, OnDestroy {

    @ViewChild('videoPlayer') videoPlayerRef!: ElementRef<HTMLVideoElement>;

    // Estado da UI
    sidebarMode: 'groups' | 'channels' = 'groups';

    // Dados
    allChannels: Channel[] = [];
    groups: ChannelGroup[] = [];
    selectedGroup: ChannelGroup | null = null;
    selectedChannel: Channel | null = null;
    searchQuery: string = '';

    // Player
    isPlaying: boolean = false;
    isBuffering: boolean = false;
    playerError: string = '';
    currentTime: string = '00:00';
    volume: number = 80;
    isMuted: boolean = false;

    // Tela cheia
    isFullscreen: boolean = false;
    showFullscreenHint: boolean = false;
    private fullscreenHintTimeout: any;

    private hls: any = null;
    private clockInterval: any;
    private retryTimeout: any;
    private retryCount: number = 0;
    private readonly MAX_RETRIES = 3;

    constructor(
        private iptv: IptvService,
        private cdr: ChangeDetectorRef,
        private playerService: PlayerService
    ) { }

    async ngOnInit(): Promise<void> {
        await this.iptv.reloadm3u();
        this.loadLiveGroups();
        this.playerService.preloadHls();
        this.startClock();

        // Sincroniza estado de fullscreen com o evento nativo do navegador
        document.addEventListener('fullscreenchange', this.onFullscreenChange.bind(this));
    }

    ngOnDestroy(): void {
        this.destroyPlayer();
        if (this.clockInterval) clearInterval(this.clockInterval);
        if (this.retryTimeout) clearTimeout(this.retryTimeout);
        if (this.fullscreenHintTimeout) clearTimeout(this.fullscreenHintTimeout);
        document.removeEventListener('fullscreenchange', this.onFullscreenChange.bind(this));
    }

    // Tecla Escape — sair do fullscreen
    @HostListener('document:keydown.escape')
    onEscape() {
        if (this.isFullscreen) this.exitFullscreen();
    }

    // ─── Carrega apenas os grupos de TV AO VIVO ────────────────────────────
    loadLiveGroups() {
        this.groups = this.iptv.getGroupsByType('live');
        this.allChannels = this.iptv.getByType('live');
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

    // ─── SIDEBAR ───────────────────────────────────────────
    get filteredChannels(): Channel[] {
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            let channels = this.iptv.getByType('live');
            return channels.filter(c => c.name.toLowerCase().includes(q)).slice(0, 10);
        }
        return this.selectedGroup ? this.selectedGroup.channels : [];
    }

    get totalLiveChannels(): number { return this.iptv.getCount('live'); }

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
        this.retryCount = 0;
        setTimeout(() => this.playChannel(channel), 100);
    }

    /** Seleciona o canal E entra em tela cheia (duplo clique na lista) */
    selectChannelAndFullscreen(channel: Channel) {
        this.selectChannel(channel);
        setTimeout(() => this.enterFullscreen(), 200);
    }

    // ─── TELA CHEIA ────────────────────────────────────────

    toggleFullscreen() {
        this.isFullscreen ? this.exitFullscreen() : this.enterFullscreen();
    }

    enterFullscreen() {
        this.isFullscreen = true;
        this.showFullscreenHintBriefly();
        this.cdr.detectChanges();

        // Tenta fullscreen nativo do navegador no elemento do player
        const el = this.videoPlayerRef?.nativeElement?.closest('.player-area') as HTMLElement;
        if (el?.requestFullscreen) {
            el.requestFullscreen().catch(() => {
                // Se o navegador bloquear, mantém apenas o modo CSS
            });
        }
    }

    exitFullscreen() {
        this.isFullscreen = false;
        this.cdr.detectChanges();

        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => { });
        }
    }

    private onFullscreenChange() {
        // Sincroniza o estado Angular com o fullscreen nativo
        if (!document.fullscreenElement && this.isFullscreen) {
            this.isFullscreen = false;
            this.cdr.detectChanges();
        }
    }

    private showFullscreenHintBriefly() {
        this.showFullscreenHint = true;
        if (this.fullscreenHintTimeout) clearTimeout(this.fullscreenHintTimeout);
        this.fullscreenHintTimeout = setTimeout(() => {
            this.showFullscreenHint = false;
            this.cdr.detectChanges();
        }, 2500);
    }

    // ─── PLAYER ────────────────────────────────────────────

    async playChannel(channel: Channel) {
        this.destroyPlayer();
        const video = this.videoPlayerRef?.nativeElement;
        if (!video) return;

        this.isPlaying = false;
        this.isBuffering = true;
        this.playerError = '';
        this.cdr.detectChanges();

        const url = channel.url.trim();
        const isHls = url.includes('.m3u8') || url.includes('/hls/') || url.includes('type=m3u_plus');

        isHls ? this.tryPlayHls(video, url) : this.tryPlayNative(video, url);
    }

    tryPlayHls(video: HTMLVideoElement, url: string) {
        const HlsLib = (window as any).Hls;

        if (!HlsLib) {
            setTimeout(() => {
                (window as any).Hls ? this.tryPlayHls(video, url) : this.tryPlayNative(video, url);
            }, 1000);
            return;
        }

        if (!HlsLib.isSupported()) { this.tryPlayNative(video, url); return; }

        this.hls = new HlsLib(HLS_CONFIG);
        this.hls.loadSource(url);
        this.hls.attachMedia(video);

        this.hls.on(HlsLib.Events.MANIFEST_PARSED, () => {
            video.play()
                .then(() => { this.isPlaying = true; this.isBuffering = false; this.retryCount = 0; this.cdr.detectChanges(); })
                .catch(() => {
                    video.muted = true;
                    video.play()
                        .then(() => { this.isPlaying = true; this.isBuffering = false; this.cdr.detectChanges(); })
                        .catch(() => this.showError('Reprodução bloqueada. Pressione Play.'));
                });
        });

        this.hls.on(HlsLib.Events.ERROR, (_: any, data: any) => {
            if (!data.fatal) return;
            if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR) {
                if (this.retryCount < this.MAX_RETRIES) {
                    this.retryCount++;
                    this.retryTimeout = setTimeout(() => this.hls?.startLoad(), 2000 * this.retryCount);
                } else {
                    this.hls?.destroy(); this.hls = null;
                    this.tryPlayNative(video, url);
                }
            } else if (data.type === HlsLib.ErrorTypes.MEDIA_ERROR) {
                this.hls?.recoverMediaError();
            } else {
                this.showError('Canal indisponível. Tente outro.');
            }
        });

        video.addEventListener('waiting', () => { this.isBuffering = true; this.cdr.detectChanges(); });
        video.addEventListener('playing', () => { this.isBuffering = false; this.cdr.detectChanges(); });
    }

    tryPlayNative(video: HTMLVideoElement, url: string) {
        video.src = url;
        video.load();

        const onCanPlay = () => {
            cleanup();
            video.play()
                .then(() => { this.isPlaying = true; this.isBuffering = false; this.cdr.detectChanges(); })
                .catch(() => {
                    video.muted = true;
                    video.play()
                        .then(() => { this.isPlaying = true; this.isBuffering = false; this.cdr.detectChanges(); })
                        .catch(() => this.showError('Não foi possível reproduzir este canal.'));
                });
        };

        const onError = () => {
            cleanup();
            const code = video.error?.code;
            if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) this.showError('Formato não suportado nesta TV.');
            else if (code === MediaError.MEDIA_ERR_NETWORK) this.showError('Erro de rede. Verifique sua conexão.');
            else this.showError('Canal indisponível.');
        };

        const cleanup = () => {
            video.removeEventListener('canplay', onCanPlay);
            video.removeEventListener('error', onError);
        };

        video.addEventListener('canplay', onCanPlay);
        video.addEventListener('error', onError);
        video.addEventListener('waiting', () => { this.isBuffering = true; this.cdr.detectChanges(); });
        video.addEventListener('playing', () => { this.isBuffering = false; this.cdr.detectChanges(); });
    }

    showError(msg: string) {
        this.playerError = msg;
        this.isPlaying = false;
        this.isBuffering = false;
        this.cdr.detectChanges();
    }

    destroyPlayer() {
        if (this.retryTimeout) { clearTimeout(this.retryTimeout); this.retryTimeout = null; }
        if (this.hls) { this.hls.destroy(); this.hls = null; }
        if (this.videoPlayerRef?.nativeElement) {
            const v = this.videoPlayerRef.nativeElement;
            v.pause(); v.removeAttribute('src'); v.load();
        }
        this.isPlaying = false;
        this.isBuffering = false;
    }

    // ─── CONTROLES ─────────────────────────────────────────
    togglePlay() {
        const v = this.videoPlayerRef?.nativeElement;
        if (!v) return;
        v.paused
            ? v.play().then(() => { this.isPlaying = true; this.cdr.detectChanges(); })
            : (v.pause(), this.isPlaying = false);
    }

    toggleMute() {
        const v = this.videoPlayerRef?.nativeElement;
        if (!v) return;
        this.isMuted = !this.isMuted;
        v.muted = this.isMuted;
    }

    setVolume(event: Event) {
        this.volume = +(event.target as HTMLInputElement).value;
        const v = this.videoPlayerRef?.nativeElement;
        if (v) { v.volume = this.volume / 100; this.isMuted = this.volume === 0; }
    }

    nextChannel() {
        const list = this.filteredChannels;
        const idx = list.findIndex(c => c.id === this.selectedChannel?.id);
        if (idx < list.length - 1) this.selectChannel(list[idx + 1]);
    }

    prevChannel() {
        const list = this.filteredChannels;
        const idx = list.findIndex(c => c.id === this.selectedChannel?.id);
        if (idx > 0) this.selectChannel(list[idx - 1]);
    }
}
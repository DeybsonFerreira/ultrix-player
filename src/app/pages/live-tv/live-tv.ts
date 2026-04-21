import {
    ChangeDetectorRef,
    Component,
    HostListener,
    OnDestroy,
    OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Channel, ChannelGroup } from '../../models/channel';
import { IptvService } from '../../services/iptv-service';
import { NavbarComponent } from '../../components/navbar/navbar';
import { PlayerService } from '../../services/player-service';
import { PlayerBaseService } from '../../services/player-base-service';

@Component({
    selector: 'app-live-tv',
    templateUrl: './live-tv.html',
    styleUrl: './live-tv.scss',
    standalone: true,
    imports: [CommonModule, FormsModule, NavbarComponent]
})
export class LiveTvComponent extends PlayerBaseService implements OnInit, OnDestroy {

    // ── UI
    sidebarMode: 'groups' | 'channels' = 'groups';

    // ── Dados
    allChannels: Channel[] = [];
    groups: ChannelGroup[] = [];
    selectedGroup: ChannelGroup | null = null;
    selectedChannel: Channel | null = null;
    searchQuery = '';

    // ── Fullscreen
    isFullscreen = false;
    showFullscreenHint = false;
    private fullscreenHintTimeout: any;

    constructor(
        private iptv: IptvService,
        cdr: ChangeDetectorRef,
        playerService: PlayerService
    ) {
        super(cdr, playerService);
    }

    // ── Lifecycle ──────────────────────────────────────────

    async ngOnInit(): Promise<void> {
        await this.iptv.reloadm3u('live');
        this.groups = this.iptv.getGroupsByType('live');
        this.allChannels = this.iptv.getByType('live');
        this.playerService.preloadHls();
        this.startClock();
        document.addEventListener('fullscreenchange', this.onFullscreenChange);
    }

    override ngOnDestroy(): void {
        if (this.fullscreenHintTimeout) clearTimeout(this.fullscreenHintTimeout);
        document.removeEventListener('fullscreenchange', this.onFullscreenChange);
        super.ngOnDestroy();
    }

    @HostListener('document:keydown.escape')
    onEscape() { if (this.isFullscreen) this.exitFullscreen(); }

    // ── Sidebar ────────────────────────────────────────────

    get filteredChannels(): Channel[] {
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            return this.iptv.getByType('live')
                .filter(c => c.name.toLowerCase().includes(q))
                .slice(0, 10);
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
        setTimeout(() => this.startPlayback(channel.url), 100);
    }

    selectChannelAndFullscreen(channel: Channel) {
        this.selectChannel(channel);
        setTimeout(() => this.enterFullscreen(), 200);
    }

    // ── Fullscreen ─────────────────────────────────────────

    toggleFullscreen() { this.isFullscreen ? this.exitFullscreen() : this.enterFullscreen(); }

    enterFullscreen() {
        this.isFullscreen = true;
        this.showFullscreenHintBriefly();
        this.cdr.detectChanges();

        const el = this.videoPlayerRef?.nativeElement?.closest('.player-area') as HTMLElement;
        el?.requestFullscreen?.().catch(() => { });
    }

    exitFullscreen() {
        this.isFullscreen = false;
        this.cdr.detectChanges();
        if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    }

    private onFullscreenChange = () => {
        if (!document.fullscreenElement && this.isFullscreen) {
            this.isFullscreen = false;
            this.cdr.detectChanges();
        }
    };

    private showFullscreenHintBriefly() {
        this.showFullscreenHint = true;
        if (this.fullscreenHintTimeout) clearTimeout(this.fullscreenHintTimeout);
        this.fullscreenHintTimeout = setTimeout(() => {
            this.showFullscreenHint = false;
            this.cdr.detectChanges();
        }, 2500);
    }

    // ── Navegação de canais ────────────────────────────────

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
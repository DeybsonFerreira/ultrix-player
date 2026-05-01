import {
    AfterViewInit,
    ChangeDetectorRef,
    Component,
    ElementRef,
    HostListener,
    OnDestroy,
    OnInit,
    QueryList,
    ViewChildren
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Channel, ChannelGroup } from '../../models/channel';
import { IptvService } from '../../services/iptv-service';
import { NavbarComponent } from '../../components/navbar/navbar';
import { PlayerService } from '../../services/player-service';

@Component({
    selector: 'app-live-tv',
    templateUrl: './live-tv.html',
    styleUrl: './live-tv.scss',
    standalone: true,
    imports: [CommonModule, FormsModule, NavbarComponent]
})
export class LiveTvComponent extends PlayerService implements OnInit, AfterViewInit, OnDestroy {

    @ViewChildren('groupBtn') private groupButtons!: QueryList<ElementRef<HTMLElement>>;
    @ViewChildren('channelBtn') private channelButtons!: QueryList<ElementRef<HTMLElement>>;
    @ViewChildren('playerCtrlBtn') private playerCtrlButtons!: QueryList<ElementRef<HTMLElement>>;

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
    private fullscreenHintTimeout: ReturnType<typeof setTimeout> | null = null;

    // ── Controls auto-hide
    showControls = false;
    private controlsTimeout: any;

    constructor(
        private iptv: IptvService, cdr: ChangeDetectorRef
    ) {
        super(cdr);
    }

    // ── Lifecycle ──────────────────────────────────────────

    async ngOnInit(): Promise<void> {
        await this.iptv.reloadm3u('live');
        this.groups = this.iptv.getGroupsByType('live');
        this.allChannels = this.iptv.getByType('live');
        this.startClock();
        document.addEventListener('fullscreenchange', this.onFullscreenChange);
        setTimeout(() => this.focusInitialTarget(), 0);
    }

    ngAfterViewInit(): void {
        setTimeout(() => this.focusInitialTarget(), 0);
    }

    override ngOnDestroy(): void {
        if (this.fullscreenHintTimeout) {
            clearTimeout(this.fullscreenHintTimeout);
            this.fullscreenHintTimeout = null;
        }
        if (this.controlsTimeout) clearTimeout(this.controlsTimeout);
        document.removeEventListener('fullscreenchange', this.onFullscreenChange);
        super.ngOnDestroy();
    }

    @HostListener('document:keydown', ['$event'])
    onRemoteKeydown(event: KeyboardEvent): void {
        if (!this.isRemoteKey(event.key) || this.isTextInputTarget(event.target)) return;

        let handled = false;

        switch (event.key) {
            case 'ArrowUp':
                if (this.isFullscreen) {
                    this.prevChannel();
                    handled = true;
                } else {
                    handled = this.handleVerticalNavigation(-1);
                }
                break;
            case 'ArrowDown':
                if (this.isFullscreen) {
                    this.nextChannel();
                    handled = true;
                } else {
                    handled = this.handleVerticalNavigation(1);
                }
                break;
            case 'ArrowLeft':
                if (this.isFullscreen) {
                    this.prevChannel();
                    handled = true;
                } else {
                    handled = this.handleHorizontalNavigation(-1);
                }
                break;
            case 'ArrowRight':
                if (this.isFullscreen) {
                    this.nextChannel();
                    handled = true;
                } else {
                    handled = this.handleHorizontalNavigation(1);
                }
                break;
            case 'Enter':
            case ' ':
                handled = this.activateFocusedElement();
                break;
            case 'Escape':
            case 'Backspace':
            case 'BrowserBack':
                if (this.isFullscreen) {
                    this.exitFullscreen();
                    this.focusSelectedChannel();
                    handled = true;
                } else if (this.sidebarMode === 'channels') {
                    this.backToGroups();
                    this.focusSelectedGroup();
                    handled = true;
                }
                break;
            case 'f':
            case 'F':
                if (this.selectedChannel) {
                    this.toggleFullscreen();
                    handled = true;
                }
                break;
            case 'ChannelUp':
            case 'MediaTrackNext':
                this.nextChannel();
                handled = true;
                break;
            case 'ChannelDown':
            case 'MediaTrackPrevious':
                this.prevChannel();
                handled = true;
                break;
            default:
                handled = false;
        }

        if (!handled) return;

        event.stopPropagation();
    }

    @HostListener('document:mousemove', ['$event'])
    onMouseMove(event: MouseEvent): void {
        if (this.isFullscreen) {
            this.showControls = true;
            this.resetControlsTimeout();
        }
    }

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
        this.focusChannelByIndex(0);
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
        this.focusSelectedChannel();
    }

    selectChannelAndFullscreen(channel: Channel) {
        this.selectChannel(channel);
        setTimeout(() => this.enterFullscreen(), 200);
    }

    // ── Fullscreen ─────────────────────────────────────────

    toggleFullscreen() { this.isFullscreen ? this.exitFullscreen() : this.enterFullscreen(); }

    enterFullscreen() {
        this.isFullscreen = true;
        this.showControls = true;
        this.resetControlsTimeout();
        this.showFullscreenHintBriefly();
        this.cdr.detectChanges();

        const el = this.videoPlayerRef?.nativeElement?.closest('.player-area') as HTMLElement;
        el?.requestFullscreen?.().catch(() => { });
        this.focusControlByIndex(1);
    }

    exitFullscreen() {
        this.isFullscreen = false;
        this.showControls = false;
        if (this.controlsTimeout) clearTimeout(this.controlsTimeout);
        this.cdr.detectChanges();
        if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    }

    private onFullscreenChange = () => {
        if (!document.fullscreenElement && this.isFullscreen) {
            this.isFullscreen = false;
            this.cdr.detectChanges();
        }
    };

    private resetControlsTimeout() {
        if (this.controlsTimeout) clearTimeout(this.controlsTimeout);
        this.controlsTimeout = setTimeout(() => {
            this.showControls = false;
            this.cdr.detectChanges();
        }, 3000);
    }

    private showFullscreenHintBriefly() {
        this.showFullscreenHint = true;
        if (this.fullscreenHintTimeout) clearTimeout(this.fullscreenHintTimeout);
        this.fullscreenHintTimeout = setTimeout(() => {
            this.showFullscreenHint = false;
            this.cdr.detectChanges();
        }, 2500);
    }

    private isRemoteKey(key: string): boolean {
        return [
            'ArrowUp',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
            'Enter',
            ' ',
            'Escape',
            'Backspace',
            'BrowserBack',
            'f',
            'F',
            'ChannelUp',
            'ChannelDown',
            'MediaTrackNext',
            'MediaTrackPrevious'
        ].includes(key);
    }

    private isTextInputTarget(target: EventTarget | null): boolean {
        const element = target as HTMLElement | null;
        if (!element) return false;
        const tag = element.tagName.toLowerCase();
        return tag === 'input' || tag === 'textarea' || element.isContentEditable;
    }

    private focusInitialTarget(): void {
        if (this.selectedChannel) {
            this.focusSelectedChannel();
            return;
        }

        if (this.selectedGroup) {
            this.focusSelectedGroup();
            return;
        }

        this.focusGroupByIndex(0);
    }

    private getGroupButtons(): HTMLElement[] {
        return this.groupButtons?.toArray().map(btn => btn.nativeElement) ?? [];
    }

    private getChannelButtons(): HTMLElement[] {
        return this.channelButtons?.toArray().map(btn => btn.nativeElement) ?? [];
    }

    private getControlButtons(): HTMLElement[] {
        return this.playerCtrlButtons?.toArray().map(btn => btn.nativeElement) ?? [];
    }

    private focusGroupByIndex(index: number): boolean {
        const items = this.getGroupButtons();
        if (items.length === 0) return false;
        const safe = Math.max(0, Math.min(items.length - 1, index));
        setTimeout(() => items[safe].focus(), 0);
        return true;
    }

    private focusChannelByIndex(index: number): boolean {
        setTimeout(() => {
            const items = this.getChannelButtons();
            if (items.length === 0) return;
            const safe = Math.max(0, Math.min(items.length - 1, index));
            items[safe].focus();
        }, 0);
        return true;
    }

    private focusControlByIndex(index: number): boolean {
        setTimeout(() => {
            const items = this.getControlButtons();
            if (items.length === 0) return;
            const safe = Math.max(0, Math.min(items.length - 1, index));
            items[safe].focus();
        }, 0);
        return true;
    }

    private focusSelectedGroup(): boolean {
        const idx = this.groups.findIndex(g => g.name === this.selectedGroup?.name);
        return this.focusGroupByIndex(idx >= 0 ? idx : 0);
    }

    private focusSelectedChannel(): boolean {
        const list = this.filteredChannels;
        const idx = list.findIndex(c => c.id === this.selectedChannel?.id);
        return this.focusChannelByIndex(idx >= 0 ? idx : 0);
    }

    private handleVerticalNavigation(direction: -1 | 1): boolean {
        const active = document.activeElement as HTMLElement | null;
        if (!active) return this.focusInitialFallback();

        if (active.classList.contains('group-item')) return this.moveInGroups(direction);

        if (active.classList.contains('channel-item')) return this.moveInChannels(direction);

        if (active.classList.contains('ctrl-btn') && direction < 0) return this.focusSelectedChannel();

        return false;
    }

    private handleHorizontalNavigation(direction: -1 | 1): boolean {
        const active = document.activeElement as HTMLElement | null;
        if (!active) return this.focusInitialFallback();

        if (active.classList.contains('group-item') && direction > 0) return this.focusChannelByIndex(0);

        if (active.classList.contains('channel-item')) {
            return direction < 0 ? this.focusSelectedGroup() : this.focusControlByIndex(0);
        }

        if (active.classList.contains('ctrl-btn')) return this.moveInControls(direction);

        return false;
    }

    private moveInGroups(direction: -1 | 1): boolean {
        const items = this.getGroupButtons();
        if (items.length === 0) return false;

        const active = document.activeElement as HTMLElement | null;
        const current = items.findIndex(item => item === active);
        const base = current >= 0 ? current : this.groups.findIndex(g => g.name === this.selectedGroup?.name);
        const next = Math.max(0, Math.min(items.length - 1, base + direction));

        const nextGroup = this.groups[next];
        if (nextGroup) this.selectGroup(nextGroup);
        return this.focusGroupByIndex(next);
    }

    private moveInChannels(direction: -1 | 1): boolean {
        const items = this.getChannelButtons();
        if (items.length === 0) return false;

        const active = document.activeElement as HTMLElement | null;
        const current = items.findIndex(item => item === active);
        const fallback = this.filteredChannels.findIndex(c => c.id === this.selectedChannel?.id);
        const base = current >= 0 ? current : fallback;
        const next = Math.max(0, Math.min(items.length - 1, base + direction));
        return this.focusChannelByIndex(next);
    }

    private moveInControls(direction: -1 | 1): boolean {
        const items = this.getControlButtons();
        if (items.length === 0) return false;

        const active = document.activeElement as HTMLElement | null;
        const current = items.findIndex(item => item === active);

        if (current <= 0 && direction < 0) return this.focusSelectedChannel();

        const base = current >= 0 ? current : 0;
        const next = Math.max(0, Math.min(items.length - 1, base + direction));
        return this.focusControlByIndex(next);
    }

    private activateFocusedElement(): boolean {
        const active = document.activeElement as HTMLElement | null;
        if (!active) return this.focusInitialFallback();

        if (
            active.classList.contains('group-item')
            || active.classList.contains('channel-item')
            || active.classList.contains('ctrl-btn')
        ) {
            active.click();
            return true;
        }

        return false;
    }

    private focusInitialFallback(): boolean {
        this.focusInitialTarget();
        return true;
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
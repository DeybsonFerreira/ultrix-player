import { Injectable } from '@angular/core';
import { ContentType } from '../models/contentType';
import { Channel } from '../models/channel';
import { ChannelGroup } from '../models/channelGroup';
import { DexieService } from './dexie-service';
import { m3uListResult, m3uResult } from '../models/m3uListResult';

// ─── Palavras-chave para classificação ───────────────────────────────────
const SERIES_KEYWORDS = ['serie', 'série', 'S •', 'C •'];
const MOVIE_KEYWORDS = ['filme', 'movie', 'F •'];
const LIVE_KEYWORDS = ['canais', 'canal', 'ao vivo'];

function classifyContent(name: string, group: string): ContentType {

  const nameLower = name.toLowerCase();
  const groupLower = group.toLowerCase();
  const fullText = `${nameLower} ${groupLower}`;

  if (LIVE_KEYWORDS.some(k => fullText.includes(k.toLowerCase()))) {
    return 'live';
  }

  if (SERIES_KEYWORDS.some(k => fullText.includes(k.toLowerCase()))) {
    return 'series';
  }

  if (MOVIE_KEYWORDS.some(k => fullText.includes(k.toLowerCase()))) {
    return 'movie';
  }

  return 'live';
}


// ─── Serviço ──────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class IptvService {


  constructor(
    private dexie: DexieService) {
  }

  private _allChannels: Channel[] = [];
  private _loaded = false;



  // ── Acesso público ────────────────────────────────────

  get isLoaded(): boolean { return this._loaded; }
  get totalChannels(): number { return this._allChannels.length; }

  async reloadm3u() {
    if (!this.isLoaded) {
      const result: m3uResult = await this.dexie.getPlaylistFromDexieActive();
      if (result.ok && result.data) {
        await this.parseM3U(result.data.content);
      }
    }
  }

  getByType(type: ContentType): Channel[] {
    return this._allChannels.filter(c => c.type === type);
  }

  getGroupsByType(type: ContentType): ChannelGroup[] {
    const channels = this.getByType(type);
    const map = new Map<string, Channel[]>();
    for (const ch of channels) {
      if (!map.has(ch.group)) map.set(ch.group, []);
      map.get(ch.group)!.push(ch);
    }
    let result = Array.from(map.entries()).map(([name, channels]) => ({ name, channels }));
    return result;
  }

  getCount(type: ContentType): number {
    return this.getByType(type).length;
  }


  // ── Parse ─────────────────────────────────────────────
  async parseM3U(content: string) {
    // Uso de Regex global para extração mais rápida em arquivos grandes
    const lines = content.split('\n');
    if (!lines[0]?.startsWith('#EXTM3U')) {
      return { ok: false, error: 'Arquivo inválido.' };
    }

    const channels: Channel[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('#EXTINF:')) {
        // Extração via Regex para evitar múltiplos .match lentos
        const name = line.split(',').pop()?.trim() || 'Sem nome';
        const group = line.match(/group-title="([^"]*)"/i)?.[1] || 'Canais';
        const logo = line.match(/tvg-logo="([^"]*)"/i)?.[1] || '';
        const tvgId = line.match(/tvg-id="([^"]*)"/i)?.[1] || '';
        const type = classifyContent(name, group);

        // A URL costuma ser a próxima linha que não começa com #
        let url = '';
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();
          if (nextLine && !nextLine.startsWith('#')) {
            url = nextLine;
            i = j; // Pula o cursor para a linha da URL
            break;
          }
        }

        if (url) {
          channels.push({ id: `ch_${channels.length}`, name, url, logo, group, tvgId, type });
        }
      }
    }

    if (channels.length === 0)
      return { ok: false, error: 'Playlist vazia.' };

    this._allChannels = channels;
    this._loaded = true;
    return { ok: true, total: channels.length, data: channels };
  }
}
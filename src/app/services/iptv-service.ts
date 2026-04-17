import { Injectable } from '@angular/core';
import { ContentType } from '../models/contentType';
import { Channel, ChannelGroup } from '../models/channel';
import { DexieService } from './dexie-service';
import { m3uResult } from '../models/m3uListResult';
import { Series, SeriesGroup } from '../models/serie';

// ─── Palavras-chave para classificação ───────────────────────────────────
const SERIES_KEYWORDS = ['serie', 'série', 'temporada', 'season'];
const MOVIE_KEYWORDS = ['filme', 'movie', 'cinema'];
const LIVE_KEYWORDS = ['canal', 'canais', 'ao vivo', 'tv'];

function classifyContent(name: string, group: string, url: string): ContentType {
  const text = `${name} ${group}`.toLowerCase();
  const urlLower = url.toLowerCase();

  // 🥇 URL (mais confiável)
  if (urlLower.includes('/series/')) return 'series';
  if (urlLower.includes('/movie/') || urlLower.includes('/vod/')) return 'movie';
  if (urlLower.includes('/live/')) return 'live';

  // 🥇 Padrão episódio
  if (/s\d{1,2}e\d{1,2}/i.test(name)) return 'series';
  if (/\d{1,2}x\d{1,2}/.test(name)) return 'series';

  // 🥈 Keywords
  if (LIVE_KEYWORDS.some(k => text.includes(k))) return 'live';
  if (SERIES_KEYWORDS.some(k => text.includes(k))) return 'series';
  if (MOVIE_KEYWORDS.some(k => text.includes(k))) return 'movie';

  return 'live';
}

//Normalizar nome da série
function normalizeSeriesName(name: string): string {
  return name
    .replace(/s\d{1,2}e\d{1,2}/i, '')
    .replace(/\d{1,2}x\d{1,2}/i, '')
    .replace(/[\.\-_]/g, ' ')
    .trim();
}

//Extrair temporada/episódio
function extractSeasonEpisode(name: string) {
  const patterns = [
    /s(\d{1,2})e(\d{1,2})/i,
    /(\d{1,2})x(\d{1,2})/
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) {
      return {
        season: parseInt(match[1], 10),
        episode: parseInt(match[2], 10)
      };
    }
  }

  return null;
}

// ─── Serviço ──────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class IptvService {


  constructor(
    private dexie: DexieService) {
  }

  private _allChannels: Channel[] = [];
  private _allSeries: Series[] = [];
  private _loaded = false;



  // ── Acesso público ────────────────────────────────────

  get isLoaded(): boolean { return this._loaded; }
  get totalChannels(): number { return this._allChannels.length; }
  get totalSeries(): number { return this._allSeries.length; }

  async reloadm3u(type: ContentType) {
    if (!this.isLoaded) {
      this._allChannels = []

      const result: m3uResult = await this.dexie.getPlaylistFromDexieActive();
      if (result.ok && result.data) {

        const parsed = this.parseM3U(result.data.content);

        if (type == 'live')
          this._allChannels = parsed.filter(x => x.type === 'live');

        if (type == 'movie')
          this._allChannels = parsed.filter(x => x.type === 'movie');

        if (type == 'series') {
          this._allChannels = parsed.filter(x => x.type === 'series');
          // this._allSeries = this.buildSeriesStructure(parsed);
        }
      }
    }
  }

  getByType(type: ContentType): Channel[] {
    return this._allChannels.filter(c => c.type === type);
  }

  getGroupsByType(type: ContentType): ChannelGroup[] {
    const channels = this.getByType(type);
    const groups = new Map<string, Channel[]>();

    // Agrupar canais por grupo
    for (const channel of channels) {
      const groupName = channel.group;

      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }

      groups.get(groupName)!.push(channel);
    }

    // Transformar o Map em array de ChannelGroup
    const result: ChannelGroup[] = [];

    for (const [name, groupChannels] of groups.entries()) {
      result.push({ name, channels: groupChannels, type: type.toString() });
    }

    return result;
  }

  getCount(type: ContentType): number {
    return this.getByType(type).length;
  }

  parseM3U(content: string): Channel[] {
    const lines = content.split('\n');

    const channels: Channel[] = [];

    const groupRegex = /group-title="([^"]*)"/i;
    const logoRegex = /tvg-logo="([^"]*)"/i;
    const tvgIdRegex = /tvg-id="([^"]*)"/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line.startsWith('#EXTINF:')) continue;

      const name = line.split(',').pop()?.trim() || 'Sem nome';

      const group = groupRegex.exec(line)?.[1] || 'Canais';
      const logo = logoRegex.exec(line)?.[1] || '';
      const tvgId = tvgIdRegex.exec(line)?.[1] || '';

      let url = '';

      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();

        if (!nextLine || nextLine.startsWith('#')) continue;

        url = nextLine;
        i = j;
        break;
      }

      if (!url) continue;

      const type = classifyContent(name, group, url);

      channels.push({ id: `ch_${channels.length}`, name, url, logo, group, tvgId, type });
    }

    return channels;
  }

  buildSeriesStructure(channels: Channel[]): Series[] {
    const map = new Map<string, Series>();

    for (const ch of channels) {
      if (ch.type !== 'series') continue;

      const info = extractSeasonEpisode(ch.name);
      if (!info) continue;

      const seriesName = normalizeSeriesName(ch.name);

      if (!map.has(seriesName)) {
        map.set(seriesName, {
          name: seriesName,
          seasons: [],
          group: ch.group
        });
      }

      const series = map.get(seriesName)!;

      let season = series.seasons.find(s => s.season === info.season);

      if (!season) {
        season = { season: info.season, episodes: [] };
        series.seasons.push(season);
      }

      season.episodes.push({
        name: ch.name,
        url: ch.url,
        episode: info.episode
      });
    }

    // ordenar
    for (const s of map.values()) {
      s.seasons.sort((a, b) => a.season - b.season);
      for (const season of s.seasons) {
        season.episodes.sort((a, b) => a.episode - b.episode);
      }
    }

    return Array.from(map.values());
  }
}
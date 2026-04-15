import { ContentType } from "./contentType";

export interface Channel {
    id: string;
    name: string;
    url: string;
    logo?: string;
    group: string;
    tvgId?: string;
    type: ContentType;
}

export interface Episode {
    name: string;
    url: string;
    episode: number;
}

export interface Season {
    season: number;
    episodes: Episode[];
}

export interface Series {
    name: string;
    seasons: Season[];
}
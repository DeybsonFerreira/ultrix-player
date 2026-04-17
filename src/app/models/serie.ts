export interface Series {
    name: string;
    seasons: Season[];
    group: string;
    logo?: string;
}

/** Episódio individual de uma série */
export interface Episode {
    name: string;
    url: string;
    episode: number;
    logo?: string;
    id?: string;
    group?: string;
}

export interface Season {
    season: number;
    episodes: Episode[];
}

/** Grupo de séries (ex: "SÉRIES STREAMING", "CLÁSSICAS") */
export interface SeriesGroup {
    name: string;
    series: Series[];
}

/** Estrutura interna para exibir episódios de uma série */
export interface SeriesDisplay {
    title: string;
    logo: string;
    episodes: EpisodeFlat[];
}

/** Episódio achatado para facilitar navegação */
export interface EpisodeFlat extends Episode {
    seriesName: string;
    epIndex?: number;
}
import Dexie, { Table } from 'dexie';

export interface PlaylistData {
    id?: number;
    content: string;
    active: boolean;
    name?: string;
}

export class UltrixDatabase extends Dexie {
    playlists!: Table<PlaylistData>;

    constructor() {
        super('UltrixDatabase');

        this.version(1).stores({
            playlists: '++id, active' //melhor active , para filtrar
        });
    }
}

export const db = new UltrixDatabase();
import Dexie, { Table } from 'dexie';

export interface PlaylistData {
    id?: number;
    storageKey: string;
    content: string;
    updatedAt: number;
}

export class MyDatabase extends Dexie {
    playlists!: Table<PlaylistData>;

    constructor() {
        super('MyAppDatabase');
        this.version(1).stores({
            playlists: '++id, storageKey' // storageKey será nosso índice de busca
        });
    }
}

export const db = new MyDatabase();
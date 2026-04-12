import { PlaylistData } from "./db";

export class m3uListResult {
    ok: boolean = false;
    data: PlaylistData[] = []
}

export class m3uResult {
    ok: boolean = false;
    data: PlaylistData | null = null
}
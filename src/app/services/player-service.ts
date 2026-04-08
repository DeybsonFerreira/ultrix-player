import { Injectable } from "@angular/core";

@Injectable({ providedIn: 'root' })
export class PlayerService {


    preloadHls(): void {
        if ((window as any).Hls) return;

        const script = document.createElement('script');
        script.src = 'js/hls.min.js';
        script.onerror = () => {
            const cdn = document.createElement('script');
            cdn.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js';
            document.head.appendChild(cdn);
        };
        document.head.appendChild(script);
    }
}
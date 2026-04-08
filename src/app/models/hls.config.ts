// ─── Configuração HLS para WebView/APK ─────────────────
// Parâmetros mais tolerantes a latência e erros de rede na TV

export const HLS_CONFIG = {
    maxBufferLength: 60,
    maxMaxBufferLength: 600,
    maxBufferSize: 60 * 1000 * 1000,  // 60 MB
    manifestLoadingMaxRetry: 6, // Retry agressivo — essencial para streams de TV que dropam pacotes
    manifestLoadingRetryDelay: 1000,
    levelLoadingMaxRetry: 6,
    levelLoadingRetryDelay: 1000,
    fragLoadingMaxRetry: 6,
    fragLoadingRetryDelay: 1000,

    // Sem credenciais — deixa a WebView gerenciar os headers nativos
    xhrSetup: (xhr: XMLHttpRequest, _url: string) => { xhr.withCredentials = false; },

    // Worker pode falhar em WebView Android — desabilitar é mais seguro
    enableWorker: false,
    debug: false,
    manifestLoadingMaxRetryTimeout: 8000,
};
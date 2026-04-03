# 📱 Integração do Capacitor no Angular 20
https://capacitorjs.com/solution/angular

Este guia descreve como adicionar e configurar o **Capacitor** para transformar este projeto Angular em uma aplicação móvel nativa (Android/iOS).

---

## 🚀 Passo a Passo de Instalação

## 1. Instalar Dependências Core
No terminal, na raiz do projeto, instale o CLI e o Core do Capacitor:
```bash
npm install @capacitor/core @capacitor/cli
```

## 2. Inicializar o Capacitor
Inicie a configuração básica. O comando solicitará o nome do app e o ID do pacote (ex: com.seuusuario.app):

```bash
npx cap init
```

Configuração Crítica: No arquivo capacitor.config.json, verifique se o webDir aponta corretamente para a pasta de build do Angular (geralmente dist/[nome-do-projeto]/browser).

## 3. Adicionar Plataformas Nativas
Instale os pacotes de plataforma e adicione as pastas nativas ao projeto:

#### Android:
```BASH
npm install @capacitor/android
npx cap add android
```

#### ios
```bash
npm install @capacitor/ios
npx cap add ios
```


## 🛠️ Fluxo de Desenvolvimento
Sempre que realizar alterações no código Angular e desejar visualizar no emulador ou dispositivo físico, siga este fluxo:

#### Gerar o Build do Angular:
```bash
ng build
```

#### Sincronizar com as Plataformas Nativas:

```bash
npx cap sync
```

## Abrir na IDE Nativa:

Android Studio: npx cap open android

Xcode: npx cap open ios
## Comandos
``` bash


-- Copia o build web e atualiza plugins nativos.
npx cap sync

-- Compila e roda o app direto no dispositivo/emulador Android.
npx cap run android

-- Verifica se o ambiente possui todos os requisitos instalados.
npx cap doctor
```

### ⚠️ Observações para Angular 20
Standalone Components: O Capacitor funciona perfeitamente com a arquitetura standalone do Angular 20.

Acesso a APIs Nativa: Utilize o objeto Capacitor para verificar a plataforma antes de chamar APIs específicas de dispositivo para evitar erros em ambiente web.

``` js
import { Capacitor } from '@capacitor/core';

if (Capacitor.getPlatform() !== 'web') {
  // Código nativo aqui
}
```

## DICAS 
Se você pretende usar plugins específicos (como Câmera, Geolocalização ou Notificações Push), lembre-se que cada um deles geralmente exige uma instalação separada via `npm install @capacitor/[plugin]` e uma nova execução do `npx cap sync`.

### Change Budget limit
exceeded maximum budget. Budget 
>> dentro do arquivo angular.json, procure por budgets, alterar os valores kb de warn e error, para o tipo anyComponentStyle

### Atenção:
 No arquivo capacitor.config.json que será criado, verifique se o campo webDir está apontando para a pasta de saída do seu build (geralmente dist/[nome-do-projeto]/browser nas versões mais novas do Angular).
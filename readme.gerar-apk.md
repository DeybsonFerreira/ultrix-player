# 📱 Gerar APK a partir de um projeto Angular (SEM Android Studio)

Este guia mostra como transformar uma aplicação Angular em um APK usando o Capacitor e o Gradle, sem precisar do Android Studio.

---

## ✅ Pré-requisitos

Antes de começar, você precisa ter instalado:

- Node.js
- Angular CLI
- Java JDK (8 ou superior)
- Variável de ambiente `JAVA_HOME` configurada

---

## 📦 1. Build do projeto Angular

No diretório do seu projeto:

```bash
ng build
```

## Após isso, será criada a pasta:

```bash
dist/nome-do-projeto
```

## ⚙️ 2. Instalar e configurar o Capacitor

## Instale o Capacitor:

```bash
npm install @capacitor/core @capacitor/cli
```

### inicializar capacitor

```bash
npx cap init
```

## 📁 3. Configurar pasta de build

```bash
capacitor.config.ts
webDir: 'dist/nome-do-projeto'

```


## 🤖 4. Adicionar plataforma Android

```bash
npx cap add android

```

## 🔄 5. Copiar arquivos do Angular
```bash
npx cap copy
npx cap sync
```

## 🏗️ 6. Gerar APK usando Gradle (sem Android Studio)
```bash
cd android
```

## ▶️ Gerar APK de debug
```bash
.\gradlew assembleDebug
-- android/app/build/outputs/apk/debug/app-debug.apk

-- prod
.\gradlew assembleRelease
-- android/app/build/outputs/apk/release/app-release.apk
```

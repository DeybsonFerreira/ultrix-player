# 📦 Guia de Geração de APK (Android)

Este guia detalha o processo para compilar e gerar o arquivo de instalação (.apk) do projeto utilizando Angular e Capacitor.

---

## 🛠️ Pré-requisitos

1. **Android Studio** instalado e configurado.
2. **SDK do Android** atualizado (API 34+ recomendada para Angular 20).
3. **Java JDK 17+** configurado no seu sistema.

---

## 🚀 Passo a Passo para Gerar o APK

### 1. Preparar o Ambiente Web
Certifique-se de que o código Angular está compilado e os arquivos estáticos foram gerados:
```bash
ng build
```
### 2. Sincronizar com a Plataforma Nativa
Envie o build do Angular para a pasta do Android:

```bash
npx cap sync android
```

### 3 Gerar o APK via Terminal (Windows)
Navegue até a pasta android do seu projeto e execute o comando do Gradle:

```bash
cd android
./gradlew assembleDebug
```
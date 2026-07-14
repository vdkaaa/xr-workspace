# XR Workspace — Collaborative Virtual Workspace

Sala 3D colaborativa en tiempo real para equipos remotos. Soporta Meta Quest 3, HoloLens 2, PC VR y browser WebXR.

## Estructura del monorepo

```
xr-workspace/
├── unity-client/     — Cliente Unity 6.3 LTS (Quest 3, HoloLens, PC VR)
├── web-client/       — Cliente React + Three.js (WebXR browser)
├── backend/          — API Node.js + Fastify
└── docs/             — Documentación adicional
```

## Stack

| Capa | Tecnología |
|---|---|
| Engine XR | Unity 6.3 LTS (6000.3.9f1) |
| XR Framework | Unity XR Toolkit 3.0+ |
| Networking | Photon Fusion 2 |
| Frontend 3D web | React Three Fiber + Three.js |
| Backend | Node.js + Fastify |
| Base de datos | Supabase (PostgreSQL) |
| Sync tiempo real | Liveblocks (pizarrón) |
| Voz | LiveKit WebRTC |
| Caché | Upstash Redis |
| AI Summaries | Claude API + Whisper |

## Requisitos previos

- Unity 6.3 LTS (6000.3.9f1) con Android Build Support
- Node.js 20+
- Git + [Git LFS](https://git-lfs.com) (cuota activa en Billing del dueño del repo)
- Cuenta Supabase
- Cuenta Photon Engine
- Cuenta Upstash Redis
- Anthropic API Key

## Setup rápido

### 1. Clonar

```bash
git clone https://github.com/vdkaaa/xr-workspace.git
cd xr-workspace
git checkout develop
git lfs pull
```

Guía completa (presupuesto LFS, workaround, qué archivos van en LFS):
[docs/git-clone-lfs.md](docs/git-clone-lfs.md)

### 2. Backend

```bash
cd backend
cp .env.example .env   # completar variables
npm install
npm run dev
```

### 3. Web client

```bash
cd web-client
npm install
npm run dev
```

### 4. Unity client

1. Abrir Unity Hub
2. Agregar proyecto desde `/unity-client`
3. Abrir escena `Assets/Scenes/MainRoom.unity`

## Documentación completa

Ver [Notion del proyecto](https://www.notion.so/36cf190a45488104ba33c59bda3869a9)

## MVP Roadmap

| Sprint | Semanas | Objetivo |
|---|---|---|
| 1 | 1–2 | Setup + salas 3D + avatares |
| 2 | 3–4 | Sync tiempo real + pizarrón |
| 3 | 5–6 | Archivos espaciales + persistencia |
| 4 | 7–8 | Cliente WebXR browser |
| 5 | 9–10 | Voz espacial + demo piloto |
| 6 | 11–12 | AI summaries + polish |

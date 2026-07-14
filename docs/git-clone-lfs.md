# Clonar el repo (Git + LFS)

Guía corta para el equipo. El monorepo usa **Git LFS** solo para binarios pesados
(texturas, FBX, audio, etc.). Los `*.asset` de Unity van en Git normal.

## Requisitos

- Git 2.x
- [Git LFS](https://git-lfs.com) instalado (`git lfs version` debe responder)
- Acceso al repo privado `vdkaaa/xr-workspace`
- Cuota LFS activa en la cuenta dueña del repo (Billing → Budgets → Git LFS)

Si ves errores tipo `This repository exceeded its LFS budget` o `LFS upload/download missing`,
alguien del equipo con acceso a Billing tiene que subir el presupuesto LFS (p. ej. ~10 USD)
antes de poder clonar/pushear assets.

## Clone normal (recomendado)

```bash
git clone https://github.com/vdkaaa/xr-workspace.git
cd xr-workspace
git checkout develop   # rama de integración actual
git lfs pull           # baja png/fbx/audio/etc.
```

Comprobá que no quedaron punteros LFS a medias:

```bash
# No debería listar archivos .png/.fbx como "pointer"
git lfs ls-files | head
```

En Unity: abrí `unity-client/xr-room` desde Unity Hub. Si un mesh/textura falta o pesa ~130 bytes,
LFS no bajó bien → repetí `git lfs pull`.

## Si LFS está bloqueado (workaround temporal)

Podés clonar el código **sin** bajar binarios (Unity incompleto):

```bash
GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/vdkaaa/xr-workspace.git
cd xr-workspace
```

Cuando vuelva la cuota:

```bash
git lfs pull
```

## Qué va en LFS (y qué no)

| En LFS | En Git normal |
|--------|----------------|
| `.png` `.jpg` `.psd` `.tga` `.exr` | `.cs` `.ts` `.js` `.md` |
| `.fbx` `.obj` `.glb` `.gltf` `.blend` | `.asset` (ScriptableObjects, URP assets, etc.) |
| `.wav` `.mp3` `.ogg` `.mp4` | `.unity` (escenas YAML) |
| `.unitypackage` | código web/backend |

Regla: **no subas builds** (`Library/`, `Temp/`, WebGL `Builds/` del proyecto Unity)
ni dumps grandes nuevos sin hablar con el equipo.

## Web client / backend (sin LFS extra)

```bash
# backend
cd backend && cp .env.example .env && npm install && npm run dev

# web
cd web-client && cp .env.example .env && npm install && npm run dev
```

URL de prueba VR (producción): https://xr-workspace.vercel.app/unity-test

## Problemas frecuentes

| Síntoma | Qué hacer |
|---------|-----------|
| `exceeded its LFS budget` | Subir presupuesto en GitHub Billing |
| Clone OK pero Unity sin texturas | `git lfs install` + `git lfs pull` |
| Archivo de ~100–200 bytes en vez del asset | Es un puntero LFS; LFS no smudgeó |
| Push rechazado por LFS | Misma cuota; no uses LFS para archivos chicos |

## Dueño del Billing

Quien administra la org/usuario dueño del repo revisa uso acá:

https://github.com/settings/billing

→ **Budgets and alerts** → presupuesto **Git LFS** (ej. 10 USD/mes con tarjeta cargada).

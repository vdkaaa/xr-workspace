# WebXR Black Screen — Debug Context (Quest + Unity WebGL + React)

> Documento de handoff para continuar el trabajo. Resume el problema, hallazgos, fixes aplicados y estado actual al 2026-07-09.
>
> **Guía de estudio completa (básico → avanzado, bugs, HTML→React):** [`webxr-unity-react-journey.md`](./webxr-unity-react-journey.md)  
> **Contrato del bridge día a día:** [`webxr-bridge-guide.md`](./webxr-bridge-guide.md)

## Objetivo

Hacer funcionar **WebXR immersive-vr** en Meta Quest (navegador) con:

- **Unity 6** WebGL build (`6000.3.9f1`) + URP
- **React** (`react-unity-webgl`) sirviendo el build
- Bridge custom: `web-client/src/components/unity/webxr/WebXRBridge.ts`
- Plugin Unity: `unity-client/xr-room/Assets/WebXR/Plugins/WebGL/webxr.jspre`

Síntoma reportado: en 2D la escena se ve bien; al pulsar **"Entrar en VR"** el Quest entra en sesión pero el visor queda **negro** (a veces con loader infinito al principio).

---

## Arquitectura relevante

```
React (UnityViewer.tsx)
  └─ useWebXRBridge.ts
       └─ WebXRBridge.ts
            ├─ requestSession("immersive-vr")
            ├─ XRWebGLLayer(session, Module.ctx)
            ├─ hook Browser.requestAnimationFrame → session.requestAnimationFrame
            ├─ sendMessage("WebXRCameraSet", "OnStartXR" / "OnWebXRHeadsetData")
            └─ blit canvas backbuffer → XRWebGLLayer.framebuffer

Unity
  └─ WebXRCameraSet (GameObject name MUST be exact)
       ├─ WebXRManager.cs  (OnStartXR / OnEndXR / OnWebXRHeadsetData)
       └─ WebXRCamera.cs   (swap CameraMain ↔ CameraL/CameraR)
```

Prefab: `unity-client/xr-room/Assets/WebXR/Prefabs/WebXRCameraSet.prefab`  
- `CameraL` viewport: x=0, width=0.5  
- `CameraR` viewport: x=0.5, width=0.5  
- Ambas arrancan **disabled**; se activan al recibir `OnStartXR`.

---

## Bugs encontrados y fixes (orden cronológico)

### 1. `session.renderState.baseLayer` leído demasiado pronto

**Síntoma:** tras "Entrar en VR", solo aparecía `kickImmersiveRenderLoop` y luego silencio; loader del Quest pegado.

**Causa:** `session.updateRenderState({ baseLayer })` **no es síncrono**. El spec aplica el cambio al inicio del próximo XR frame. Leer `session.renderState.baseLayer` justo después devolvía `undefined` → `scheduleUnityFrame` caía a `window.requestAnimationFrame`, que el browser pausa/throttlea en VR.

**Fix:** cachear `immersiveGlLayer` en la instancia del bridge al crear el `XRWebGLLayer`.

### 2. Blit usando `bindFramebuffer` parchado

**Síntoma:** `WebGL: INVALID_OPERATION: readBuffer: invalid read buffer` + pantalla negra.

**Causa:** el patch de `gl.bindFramebuffer` redirigía `null` al framebuffer opaco del XR layer. El blit hacía `READ_FRAMEBUFFER = null` → terminaba leyendo el mismo FBO opaco (prohibido por spec).

**Fix:** usar `originalBindFramebuffer` (sin patch) en `blitCanvasToXrLayer`.

### 3. Render al FBO XR fuera del callback XR

**Síntoma:** `Cannot render to a XRWebGLLayer framebuffer outside of an XRSession animation frame callback`.

**Causa:** el redirect de framebuffer se activaba con solo `immersiveSession != null`, incluyendo frames de Unity fuera del XR rAF.

**Fix:** flag `insideXrFrame` (true solo dentro del callback de `session.requestAnimationFrame`).

### 4. Redirect directo al FBO opaco + URP

**Síntoma:** al enganchar el loop real de Unity, volvía `readBuffer: invalid read buffer` (URP llama APIs prohibidas sobre FBO opacos: SSAO/MRT/etc.).

**Fix:** desactivar redirect directo (`directFramebufferRedirectEnabled = false`). Unity siempre renderiza al canvas backbuffer; el bridge hace blit al XR layer.

### 5. `Module.InternalBrowser` era un stub vacío (CAUSA RAÍZ del loop)

**Síntoma:** `Browser.mainLoop no existe todavía` siempre; siempre caía a `startBootstrapXrLoop` (solo blit de contenido viejo/vacío); 2D funcionaba, VR negro estático.

**Causa:** en `webxr.jspre`:

```js
Module['InternalBrowser'] = Browser || {};
```

El `.jspre` se inyecta **antes** de que Emscripten asigne `var Browser = { mainLoop, requestAnimationFrame, ... }`. En ese momento `Browser` es `undefined` (hoisting) → se guardaba `{}` huérfano. Los patches del bridge nunca tocaban el `Browser` real que Unity usa.

**Fix en `webxr.jspre`:** diferir a `onRuntimeInitialized`:

```js
var origOnRuntimeInitialized = Module['onRuntimeInitialized'];
Module['onRuntimeInitialized'] = function () {
    Module['InternalBrowser'] = Browser; // ya poblado
    if (origOnRuntimeInitialized) origOnRuntimeInitialized();
};
```

**Requiere rebuild de Unity** (el `.jspre` se embebe en `framework.js`).

Tras este fix, la consola mostró correctamente:

```
mainLoop.timingMode=1 method="rAF"
kickImmersiveRenderLoop: llamando browser.requestAnimationFrame(rafCallback)
session.requestAnimationFrame programado
XR frame #1: pose válida, 2 view(s): left, right
Enviando OnStartXR a Unity
```

### 6. Resolución: Unity renderiza 928×522 dentro de canvas 2880×1584 (ESTADO ACTUAL)

**Evidencia de consola (confirmada):**

```
viewport post-Unity=(0,0,928,522) scissorTest=false canvas=2880x1584
malla 5x4 pre-blit: 2/20 píxeles con color. primer no-negro en (10%,10%)=(114,114,113,255)
```

**Interpretación:**

- El bridge WebXR funciona (sesión, frames, pose, OnStartXR, blit sin errores GL).
- Unity **sí dibuja algo** (gris ~114), pero solo en un rectángulo ~928×522 (tamaño 2D previo).
- El resto del backbuffer XR (2880×1584) queda negro → el headset se ve negro.

**Causa:** Unity WebGL deriva `Screen.width/height` del **CSS size × devicePixelRatio**, no solo de `canvas.width/height`. Cambiar solo los atributos del canvas no actualiza la resolución interna de Unity.

**Fix parcial en bridge (ya aplicado, solo TS — no requiere rebuild Unity):**

- `Module.setCanvasSize(width, height)` (API Emscripten oficial)
- Ajuste de `canvas.style.width/height` con `/ devicePixelRatio`
- Blit desde `lastUnityViewport` (sub-rectángulo) mientras Unity laggea el resize
- Helper `syncUnityCanvasSize()` llamado en `onSessionStarted` y cada `presentXrFramebuffer`

**Pendiente verificar:** tras recargar, el log debería mostrar:

```
Canvas sincronizado a 2880x1584 (setCanvasSize + CSS/dpr).
viewport post-Unity=(0,0,2880,1584) ...
malla 5x4: 15+/20 píxeles con color
```

Si el viewport sigue en 928×522, `setCanvasSize` no está llegando o Unity lo ignora.

---

## Errores de shader URP (aún abiertos)

Al arrancar Unity en Quest siempre aparecen:

```
ERROR: Shader Hidden/CoreSRP/CoreCopy shader is not supported on this GPU
ERROR: Shader Hidden/Universal Render Pipeline/StencilDitherMaskSeed ...
ERROR: Shader Hidden/Universal/HDRDebugView ...
```

`CoreCopy` es el blit final de URP al backbuffer. Si no compila en GLES3/Quest, URP puede fallar al presentar color aunque el viewport sea correcto.

**Cambios de config ya hechos en el repo:**

- `GraphicsSettings.asset` → pipeline default = `Mobile_RPAsset` (antes `PC_RPAsset`)
- `QualitySettings.asset` → `m_CurrentQuality = 0` (Mobile), WebGL excluido del tier PC
- Build confirmó: `2 URP assets included in build - Mobile_RPAsset`

**Pendiente en Unity Editor (checklist):**

1. Quality WebGL → Mobile + `Mobile_RPAsset`
2. Mobile_RPAsset: HDR OFF, MSAA 1, Render Scale 1.0, sin depth/opaque texture, sin SSAO
3. Player → Color Space: probar **Gamma** (Linear a veces rompe shaders WebGL)
4. Subir memoria WebGL (inicial 32 MB es muy bajo para VR)
5. Escena: solo `WebXRCameraSet`, sin Main Camera suelta
6. Rebuild WebGL + copiar a `web-client/public/unity-build/Build/`

---

## Archivos clave modificados

| Archivo | Rol |
|---------|-----|
| `web-client/src/components/unity/webxr/WebXRBridge.ts` | Bridge principal (loop XR, blit, setCanvasSize, diags) |
| `web-client/src/components/unity/webxr/useWebXRBridge.ts` | Hook React; attach al tener `unityInstance` |
| `web-client/src/components/unity/UnityViewer.tsx` | UI + botón VR + probe WebGL2 |
| `web-client/src/main.tsx` | Sin `React.StrictMode` (evita doble mount / contextos WebGL) |
| `unity-client/.../webxr.jspre` | `xrCompatible`, `Module.ctx`, ScaleBias URP, **InternalBrowser diferido** |
| `unity-client/.../WebXRCamera.cs` | Swap cámaras al OnXRChange |
| `unity-client/.../WebXRManager.cs` | Recibe mensajes del bridge |
| `ProjectSettings/GraphicsSettings.asset` | Mobile_RPAsset |
| `ProjectSettings/QualitySettings.asset` | Mobile default, WebGL excluye PC |

---

## Flags / herramientas de diagnóstico en el bridge

- Logs `[WebXRBridge][diag]` en consola remota (`chrome://inspect` → Quest)
- Watchdog 2s si `session.requestAnimationFrame` no dispara `animate()` (puede dispararse al quitar headset — no siempre es bug)
- Muestreo de píxeles pre-blit (malla 5×4)
- Log de viewport post-Unity
- **Modo mono:** botón **Mono ON/OFF** en la UI (o `?webxrDebugMono=1`) → no envía `OnStartXR`; Unity sigue con CameraMain.
  - Mono se ve igual de “plano” que stereo → proyección/FOV/presentación (no es solo IPD L/R).
  - Mono plano pero stereo distinto (o peor) → matrices/viewports CameraL/R.
  - Ambos con tracking ausente en mono es esperado (no se manda pose a Unity).

---

## Cómo reproducir / depurar

1. `npm run dev` en `web-client` + ngrok HTTPS (WebXR requiere secure context)
2. Abrir URL ngrok en Quest Browser
3. Esperar escena 2D visible → "Entrar en VR"
4. Consola vía `chrome://inspect` (solo pestaña Console, no Network)
5. Buscar líneas `viewport post-Unity`, `malla 5x4`, `Canvas sincronizado`, `OnStartXR`

---

## Estado actual (2026-07-09 noche)

| Capa | Estado |
|------|--------|
| Sesión WebXR | ✅ Funciona |
| Loop Unity enganchado a XR rAF | ✅ |
| Imagen en headset | ✅ Visible (ya no negro) |
| Mono ON vs OFF | ❌ Igual: imagen 2D fija, sin head tracking |
| Causa probable | Blit usaba viewport post-Unity = solo CameraR (mitad der) estirada a ambos ojos |
| Fix blit SBS completo | ✅ En bridge (HMR); verificar en Quest |
| Fix pose via `worldToCameraMatrix` | ✅ En `WebXRCamera.cs` — **requiere rebuild Unity** |
| Shader CoreCopy | ❌ Sigue en GPU Quest |

---

## Próximos pasos sugeridos

1. **Verificar en Quest** el fix de `setCanvasSize` (recarga HMR basta; no rebuild Unity).
   - Si viewport → ~2880×1584 y hay color en malla → casi resuelto; afinar estereoscopía/cámaras.
   - Si viewport sigue 928×522 → investigar por qué `Module.setCanvasSize` no actualiza Screen (¿nombre distinto en Unity 6? ¿hay que llamar desde C# `Screen.SetResolution`?).

2. **Probar `?webxrDebugMono=1`:**
   - Imagen en mono → problema en CameraL/R + URP stereo.
   - Negro también en mono → resolución o CoreCopy.

3. **Arreglar CoreCopy en Unity** (Gamma, Mobile URP mínimo, rebuild).

4. Limpiar logs de diagnóstico del bridge cuando la imagen sea estable.

---

## Notas / trampas

- No mezclar logs de Network con Console al pegar evidencia.
- `React.StrictMode` en dev monta dos veces y puede agotar contextos WebGL en Quest.
- El bootstrap XR loop (`startBootstrapXrLoop`) es un fallback peligroso: blitea sin que Unity renderice frames nuevos → negro estático. Si aparece en logs, el main loop no está enganchado.
- Warnings de scripts faltantes en build (`OculusRuntimeSettings`, etc.) son de Meta XR SDK en Resources; no bloquean WebXR browser.
- El WATCHDOG a veces dispara al salir de VR / menú sistema; no confundir con fallo de arranque.

---

## Comandos útiles

```bash
# Dev
cd web-client && npm run dev
# Túnel HTTPS para Quest
ngrok http 5173

# Comparar build Unity vs public
cmp unity-client/xr-room/Builds/XR-Rooms/Build/XR-Rooms.data.br \
    web-client/public/unity-build/Build/XR-Rooms.data.br
```

Build Unity → copiar `Builds/XR-Rooms/Build/*` a `web-client/public/unity-build/Build/`.

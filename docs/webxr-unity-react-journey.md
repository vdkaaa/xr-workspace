# WebXR + Unity WebGL + React — Guía de estudio del proyecto

> Documento de aprendizaje: cómo pasamos de un WebGL “solo HTML” (WebXR Exporter) a un stack **Unity 6 + URP + React (`react-unity-webgl`) + WebXR en Meta Quest**, qué se rompió, por qué, y qué arreglar en el próximo proyecto.
>
> Estado al cerrar el hito: **VR inmersivo con head tracking funcionando** en Quest Browser (escena Desert / WebXR).
>
> Relacionado:
> - Contrato del bridge día a día → [`webxr-bridge-guide.md`](./webxr-bridge-guide.md)
> - Handoff de debug pantalla negra → [`webxr-black-screen-debug-context.md`](./webxr-black-screen-debug-context.md)

---

## 0. Mapa mental (léelo primero)

Hay **tres mundos** que tienen que sincronizarse cada frame:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Quest / WebXR  │────▶│  Bridge (JS/TS)  │────▶│  Unity WebGL (C#)   │
│  pose + sesión  │     │  WebXRBridge.ts  │     │  cámaras + escena   │
└─────────────────┘     └────────┬─────────┘     └──────────▲──────────┘
                                 │                          │
                                 │  blit canvas → XR FBO    │
                                 └──────────────────────────┘
                                      (presentación al visor)
```

Si falla **cualquiera** de estas capas, el síntoma en el headset suele ser el mismo: negro, imagen fija, o “panel 2D”. Por eso el trabajo fue **aislar capa por capa**, no adivinar.

---

## 1. De lo más básico: ¿qué es cada pieza?

### 1.1 Unity WebGL

Unity compila tu juego a:

| Archivo | Rol |
|---------|-----|
| `*.loader.js` | Arranca el runtime |
| `*.framework.js(.br)` | Glue Emscripten + JS (incluye `.jspre` embebido) |
| `*.wasm(.br)` | Código nativo/IL2CPP |
| `*.data(.br)` | Assets de la escena |

En el navegador, Unity pinta en un **`<canvas>`** con un contexto **WebGL2**.

### 1.2 WebXR (API del navegador)

No es un plugin de Unity nativo en este setup. Es la API del browser:

1. `navigator.xr.isSessionSupported("immersive-vr")`
2. `navigator.xr.requestSession("immersive-vr")`
3. Cada frame: `session.requestAnimationFrame` → `frame.getViewerPose(refSpace)`
4. Presentás color en un `XRWebGLLayer` (framebuffer opaco del compositor)

**Importante:** en VR, `window.requestAnimationFrame` se pausa/throttlea. El loop de Unity **tiene** que engancharse al rAF de la sesión XR.

### 1.3 WebXR Exporter (paquete Mozilla / forks)

Paquete clásico que mete en Unity:

- Prefab **`WebXRCameraSet`** (CameraMain + CameraL + CameraR side-by-side)
- Scripts C#: `WebXRManager`, `WebXRCamera`, controllers…
- Plugins WebGL: `webxr.jspre`, `webxr.jslib`
- Template HTML: `Assets/WebGLTemplates/WebXR/` con un `webxr.js` grande

**Modelo original:** Unity “Build And Run” → `index.html` propio carga Unity **y** el bridge JS. Todo vive en una página estática.

### 1.4 React + `react-unity-webgl`

En este repo la app real es React (`web-client`). Unity se embebe así:

```tsx
const { unityProvider, sendMessage, UNSAFE__unityInstance, ... } = useUnityContext({...});
<Unity unityProvider={unityProvider} />
```

Eso **no carga** el `index.html` del template WebXR. Por eso el `webxr.js` del template queda **obsoleto** para la app real: hay que **portar** esa lógica a TypeScript (`WebXRBridge.ts`).

---

## 2. El viaje: HTML standalone → React

### Antes (Exporter clásico)

```
index.html (template WebXR)
  ├── unityInstance = UnityLoader / createUnityInstance(...)
  ├── webxr.js  →  session XR + SendMessage a "WebXRCameraSet"
  └── canvas
```

### Después (este proyecto)

```
React (Vite)
  └── UnityViewer.tsx
        ├── useUnityContext  →  carga Build/*.br desde /unity-build/
        └── useWebXRBridge
              └── WebXRBridge.ts  (= port del webxr.js del template)
                    └── unityInstance.SendMessage("WebXRCameraSet", ...)
```

**Qué se reutiliza del Exporter**

- Prefab y scripts C# (con fixes)
- `webxr.jspre` / `webxr.jslib` (con fixes)
- Idea de cámaras L/R + matrices view/projection

**Qué se reemplaza**

- `WebGLTemplates/WebXR/webxr.js` + `index.html` → `web-client/src/components/unity/webxr/*`

---

## 3. Arquitectura final (capas)

### 3.1 React

| Archivo | Responsabilidad |
|---------|-----------------|
| `UnityViewer.tsx` | UI, carga Unity, botón VR, toggle Mono debug |
| `useWebXRBridge.ts` | Ciclo de vida React ↔ bridge |
| `WebXRBridge.ts` | Sesión XR, hook del rAF, blit, mensajes a Unity |
| `xrMath.ts` | Conversión matrices WebGL → layout Unity |
| `xrGamepads.ts` | Controles → JSON para Unity |

### 3.2 Unity

| Pieza | Responsabilidad |
|-------|-----------------|
| GameObject **`WebXRCameraSet`** (nombre exacto) | Target de `SendMessage` |
| `WebXRManager.cs` | Recibe mensajes JS, emite eventos C# |
| `WebXRCamera.cs` | Swap Main↔L/R + aplica pose/proyección |
| `webxr.jspre` | `xrCompatible`, `Module.ctx`, `InternalBrowser` |
| `webxr.jslib` | C# → `dispatchReactUnityEvent` (React) |

### 3.3 Flujo de un frame en VR (orden mental)

```
1. session.requestAnimationFrame(callback)
2. Bridge: clear XR framebuffer (loader del Quest)
3. Bridge: getViewerPose → SendMessage OnWebXRHeadsetData (+ OnStartXR 1ª vez)
4. Bridge: llama al rafCallback de Unity (un frame de juego)
5. Unity/URP: pinta CameraL y CameraR al backbuffer del canvas (SBS)
6. Bridge: blitFramebuffer(canvas → XRWebGLLayer.framebuffer)
7. Compositor del Quest muestra el layer en el visor
```

---

## 4. Conceptos técnicos que hay que dominar

### 4.1 Un solo contexto WebGL

`XRWebGLLayer` **debe** usar el mismo `WebGLRenderingContext` que Unity (`Module.ctx`).  
Si hacés `canvas.getContext("webgl2")` de nuevo, fallás o creás un segundo contexto (Quest tiene pocos).

### 4.2 Framebuffer opaco de WebXR

El FBO del `XRWebGLLayer` **no** es un FBO normal:

- Solo se puede dibujar **dentro** del callback de `session.requestAnimationFrame`
- URP (SSAO, MRT, ciertos blits) **rompe** si Unity renderiza directo ahí
- Estrategia estable: Unity → **canvas backbuffer** → bridge hace **`blitFramebuffer`** al layer XR

### 4.3 Side-by-side (SBS)

`CameraL` viewport `x=0, width=0.5`  
`CameraR` viewport `x=0.5, width=0.5`  

El canvas es una imagen ancha; el compositor la interpreta como ojos izquierdo/derecho.

### 4.4 Matrices

WebXR da `view.projectionMatrix` y `view.transform.inverse.matrix` (column-major, convención GL).  
Unity espera otro layout / handedness → `glProjectionToUnity` / `glViewToUnity` en `xrMath.ts`, y en C# `WebXRMatrixUtil`.

Con **URP**, no alcanza con setear matrices en cualquier momento: hay que hacerlo en  
`RenderPipelineManager.beginCameraRendering` (Built-in usaba `Camera.onPreRender`, que **URP no llama**).

### 4.5 Emscripten `Browser` y `.jspre`

Los archivos `.jspre` se inyectan **muy temprano** en `framework.js`, **antes** de que exista el objeto real `Browser = { mainLoop, requestAnimationFrame, ... }`.

Si hacés `Module.InternalBrowser = Browser || {}` en ese instante, `Browser` es `undefined` (hoisting) y guardás `{}`. Después el bridge parchea el stub vacío y Unity sigue usando el `Browser` real → **loop XR nunca engancha**.

### 4.6 `SendMessage` desde React

```ts
unityInstance.SendMessage("WebXRCameraSet", "OnStartXR", "");
```

Trampas:

1. El GameObject debe llamarse **exactamente** `WebXRCameraSet`
2. El método debe existir y no ser strippeado (usar `[Preserve]` en métodos solo llamados desde JS)
3. **No capturar** el `sendMessage` de React en un closure creado cuando `unityInstance` aún es `null` (bug que tuvimos: mensajes “enviados” en log pero Unity no recibía nada)

---

## 5. Bugs encontrados (cronológico) — de síntoma a causa

Esta es la parte más útil para estudiar. Cada bug enseña una capa distinta.

### Bug A — Loader infinito / silencio tras “Entrar en VR”

| | |
|--|--|
| **Síntoma** | Quest entra a VR pero se queda en loader; pocos logs |
| **Causa** | `updateRenderState({ baseLayer })` no es síncrono; leer `session.renderState.baseLayer` devolvía `undefined` → fallback a `window.rAF` (pausado en VR) |
| **Fix** | Cachear `immersiveGlLayer` al crear el `XRWebGLLayer` |
| **Lección** | Nunca confíes en que el render state XR ya aplicó “en la misma línea” |

### Bug B — `readBuffer: invalid read buffer`

| | |
|--|--|
| **Síntoma** | Error GL + negro |
| **Causa** | Patch de `bindFramebuffer(null → XR FBO)` hacía que el blit leyera el FBO opaco (ilegal) |
| **Fix** | Blit con `bindFramebuffer` **original** (sin patch) |
| **Lección** | Separá “redirect para Unity” de “operaciones del bridge” |

### Bug C — Render fuera del XR frame callback

| | |
|--|--|
| **Síntoma** | `Cannot render to a XRWebGLLayer framebuffer outside of an XRSession animation frame callback` |
| **Causa** | Redirect activo solo por “hay sesión”, no por “estamos dentro del XR rAF” |
| **Fix** | Flag `insideXrFrame` |
| **Lección** | El spec de WebXR es estricto con el timing del FBO opaco |

### Bug D — URP + FBO opaco

| | |
|--|--|
| **Síntoma** | Al enganchar el loop real, vuelven errores de readBuffer / APIs inválidas |
| **Causa** | URP usa caminos (MRT, etc.) incompatibles con FBO XR opaco |
| **Fix** | No redirect directo; siempre canvas + blit |
| **Lección** | “Render directo al XR layer” suena óptimo; con URP suele ser peor |

### Bug E — `Module.InternalBrowser = {}` (causa raíz del loop)

| | |
|--|--|
| **Síntoma** | Bootstrap loop eterno; Unity no renderiza frames nuevos en VR; negro estático |
| **Causa** | `.jspre` asignaba `InternalBrowser` antes de que Emscripten creara `Browser` |
| **Fix** | Asignar en `Module.onRuntimeInitialized` |
| **Lección** | Orden de inicialización Emscripten/Unity es parte del diseño, no un detalle |

### Bug F — Resolución: Unity pinta 928×522 dentro de 2880×1584

| | |
|--|--|
| **Síntoma** | Casi negro; solo un rectángulo chico con color |
| **Causa** | Unity deriva `Screen` del CSS/`matchWebGLToCanvasSize`, no solo de `canvas.width` |
| **Fix** | `Module.setCanvasSize`, CSS/dpr, `OnXRResolution` → `Screen.SetResolution`, desactivar `matchWebGLToCanvasSize` en sesión |
| **Lección** | En WebGL, “tamaño del canvas” ≠ “tamaño lógico de Unity” |

### Bug G — Imagen visible pero “2D fija” (sin head tracking)

| | |
|--|--|
| **Síntoma** | Se ve la escena, pero al girar la cabeza el mundo no sigue (panel) |
| **Causas combinadas** | (1) blit usando solo viewport de CameraR; (2) pose no aplicada en el momento correcto en URP; (3) **SendMessage stale** desde React |
| **Fixes** | Blit full SBS; `beginCameraRendering` + transforms; `sendToUnity()` vía `unityInstance` vivo; ACK `xr-started` |
| **Lección** | “Hay imagen” ≠ “hay tracking”. Aislá con Mono ON/OFF y muestreo de píxeles |

### Bug H — `sendMessage` capturado con `unityInstance === null`

| | |
|--|--|
| **Síntoma** | Logs decían “Enviando OnStartXR” pero Unity no logueaba nada; viewport full CameraMain |
| **Causa** | `useWebXRBridge` creaba el bridge una vez y guardaba el `sendMessage` de un render temprano (no-op eterno) |
| **Fix** | `getUnityInstance()?.SendMessage(...)` en cada llamada |
| **Lección** | En React, cualquier API que dependa de una instancia async debe leerse por **ref**, no por closure |

---

## 6. Cómo depuramos (metodología)

Orden que funcionó:

1. **¿Hay sesión XR?** → logs de `requestSession`, pose, views left/right  
2. **¿Corre el XR rAF?** → contador de frames; si no, InternalBrowser / baseLayer  
3. **¿El layer presenta algo?** → `?webxrDebugClear=1` (magenta = compositor OK)  
4. **¿Unity pinta?** → malla 5×4 de `readPixels` pre-blit  
5. **¿Resolución?** → `viewport post-Unity` vs tamaño del layer  
6. **¿Llegó OnStartXR?** → ACK `xr-started` + log `WebXRCamera: XR ENABLED`  
7. **¿Hay tracking?** → píxeles que cambian al mover la cabeza  

Herramientas:

- Quest + `ngrok http 5173` (HTTPS obligatorio para WebXR)
- `chrome://inspect` + **adb** (USB debugging) para consola remota
- Toggle **Mono ON/OFF** en la UI
- `productVersion` en `useUnityContext` para invalidar `UnityCache`

---

## 7. Checklist para repetir esto en otro proyecto

### Unity

- [ ] Escena de build con **un** `WebXRCameraSet` (nombre exacto), sin Main Camera suelta compitiendo  
- [ ] CameraL/R viewports 0.5 / 0.5; Main on, L/R off al inicio  
- [ ] URP Mobile (o asset liviano): HDR off si hay problemas de shaders en Quest  
- [ ] `webxr.jspre`: `InternalBrowser` en `onRuntimeInitialized`; contexto `xrCompatible`  
- [ ] `WebXRCamera`: pose en `RenderPipelineManager.beginCameraRendering` (URP)  
- [ ] Métodos `OnStartXR` / `OnWebXRHeadsetData` con `[Preserve]` + overload `string`  
- [ ] Tras cambiar C# o `.jspre`: **rebuild WebGL** y copiar a `public/unity-build/Build/`  

### React

- [ ] `react-unity-webgl` con `webglContextAttributes: { xrCompatible: true }`  
- [ ] Bridge propio (no depender del template HTML)  
- [ ] `SendMessage` siempre desde la instancia **actual** (ref)  
- [ ] Blit canvas → XR layer; no asumir redirect de FBO con URP  
- [ ] Vite `allowedHosts` para ngrok  
- [ ] Evitar `React.StrictMode` en dev si agota contextos WebGL en Quest  

### Runtime Quest

- [ ] HTTPS (ngrok u otro)  
- [ ] Limpiar caché / subir `productVersion` tras cada build  
- [ ] Probar primero 2D, luego VR  

---

## 8. Glosario rápido

| Término | Significado |
|---------|-------------|
| **SBS** | Side-by-side: dos ojos en un solo framebuffer |
| **XR rAF** | `session.requestAnimationFrame` |
| **Opaque FB** | Framebuffer del `XRWebGLLayer` (reglas estrictas) |
| **Blit** | Copiar píxeles entre framebuffers (`blitFramebuffer`) |
| **jspre** | JS prependido al framework Emscripten en el build |
| **jslib** | Funciones JS llamables desde C# (`DllImport __Internal`) |
| **SendMessage** | Unity API: JS → método público de un MonoBehaviour |
| **URP** | Universal Render Pipeline |

---

## 9. Archivos “fuente de verdad” en este repo

```
web-client/src/components/unity/
  UnityViewer.tsx
  webxr/
    WebXRBridge.ts      ← cerebro del browser
    useWebXRBridge.ts
    xrMath.ts
    xrGamepads.ts

unity-client/xr-room/Assets/WebXR/
  Prefabs/WebXRCameraSet.prefab
  Scripts/WebXRManager.cs
  Scripts/WebXRCamera.cs
  Scripts/WebXRMatrixUtil.cs
  Plugins/WebGL/webxr.jspre
  Plugins/WebGL/webxr.jslib
  Samples/Desert/WebXR.unity   ← escena de prueba que usamos al final

docs/
  webxr-bridge-guide.md                    ← contrato mensajes
  webxr-black-screen-debug-context.md      ← handoff debug
  webxr-unity-react-journey.md             ← este documento
```

---

## 10. Resumen en una frase

**Portamos el bridge del WebXR Exporter de un `index.html` a React, mantuvimos el prefab/cámaras de Unity, y arreglamos la cadena completa: loop XR (Emscripten Browser) → presentación (blit URP-safe) → resolución → SendMessage vivo → pose en el callback URP.**

Cuando en otro proyecto veas “VR negro” o “se ve pero no trackea”, no empieces por shaders: **recorré las capas de la sección 0 y 6 en orden.**

---

*Última actualización: 2026-07-10 — hito head tracking OK en Quest (ACK OnStartXR + píxeles que cambian con la pose).*

# Manual — Puente WebXR (Quest) ↔ Unity WebGL ↔ React

Este documento explica cómo funciona el puente que conecta los controles del Quest
(vía WebXR del navegador) con el build de Unity WebGL embebido en `web-client`, y
cómo trabajar con él día a día. Reemplaza al viejo `Assets/WebGLTemplates/WebXR/webxr.js`
del "WebXR Exporter" de Mozilla, que estaba pensado para un `index.html` standalone
que la app real ya no usa.

> Contexto previo: ver el análisis de inconsistencias hecho sobre `Assets/WebXR`
> (Unity 6, Input System, APIs de XR obsoletas, etc.) — este documento asume esa
> limpieza ya aplicada a `WebXRController.cs`, `WebXRManager.cs`, etc.

## 1. Arquitectura, de un vistazo

```
Quest (Oculus/Meta Browser)
   │  navigator.xr (WebXR Device API)
   ▼
web-client (React)
   │  WebXRBridge.ts  ──sendMessage()──▶  Unity WebGL (WebXRManager.cs)
   │  (src/components/unity/webxr)        │
   │  ◀──dispatchReactUnityEvent()────    │  WebXRController.cs (por mano)
   ▼                                      ▼
useUnityContext (react-unity-webgl)   Resto de la escena (WebXRCamera.cs, etc.)
```

- **`web-client/src/components/unity/webxr/WebXRBridge.ts`**: clase que habla
  directamente con `navigator.xr`, maneja la sesión inmersiva, lee los gamepads
  de los controles y le manda los datos a Unity.
- **`web-client/src/components/unity/webxr/useWebXRBridge.ts`**: hook de React
  que conecta esa clase con el ciclo de vida del componente (`isLoaded`,
  `sendMessage`, `addEventListener`, etc. de `useUnityContext`).
- **`UnityViewer.tsx`**: usa el hook, muestra el botón "Entrar en VR" y un banner
  para mensajes que Unity le pida mostrar (ej. "tu navegador no soporta VR").
- **Del lado de Unity**, nada cambia en cómo se consume el bridge: sigue siendo
  `WebXRManager` recibiendo mensajes (`OnWebXRData`, `OnWebXRHeadsetData`,
  `OnXRCapabilities`, `OnStartXR`, `OnEndXR`) y emitiendo eventos C# normales
  (`OnControllerUpdate`, `OnHeadsetUpdate`, `OnXRChange`) que consumen
  `WebXRController.cs` y `WebXRCamera.cs`. **No hace falta tocar esos consumidores.**

## 2. Contrato de mensajes (Unity ⇄ Browser)

Esto es lo único que hay que mantener sincronizado entre C# y TypeScript si algo
cambia. Todo pasa por el GameObject `WebXRCameraSet` (debe llamarse *exactamente*
así — ver `WebXRManager.GlobalName` en C# y `WEBXR_GAME_OBJECT_NAME` en
`UnityViewer.tsx`).

### Browser → Unity (`sendMessage(gameObjectName, methodName, json)`)

| Método Unity (`WebXRManager.cs`) | Cuándo se llama | Payload |
|---|---|---|
| `OnXRCapabilities` | Al terminar de cargar Unity | `{ canPresent, hasPosition, hasExternalDisplay, supportsImmersiveVR }` |
| `OnStartXR` | Al entrar en sesión inmersiva (primer frame) | *(sin payload)* |
| `OnEndXR` | Al salir de la sesión inmersiva | *(sin payload)* |
| `OnWebXRHeadsetData` | Cada frame XR, mientras hay sesión activa | `{ leftProjectionMatrix, rightProjectionMatrix, leftViewMatrix, rightViewMatrix, sitStandMatrix }` — cada uno `number[16]` |
| `OnWebXRData` | Cada frame XR, mientras hay sesión activa | `{ controllers: WebXRControllerPayload[] }` (ver `xrGamepads.ts` / `WebXRControllerData.cs`) |

### Unity → Browser (`dispatchReactUnityEvent`, escuchado con `addEventListener`)

| Evento | Disparado desde | Uso actual |
|---|---|---|
| `WebXRDisplayMessage` | `WebXRUI.displayXRElementId(id)` (ej. cuando `!capabilities.supportsImmersiveVR`, manda `"novr"`) | `UnityViewer.tsx` lo muestra como banner (`XR_DISPLAY_MESSAGES`) |
| `WebXRToggleKeyName` | `WebXRManager.ConfigureToggleXRKeyName(keyName)` | Actualmente no conectado a nada en React; ver sección 5 si se quiere usar |

**Si agregás un mensaje nuevo en cualquier dirección, actualizá esta tabla.**

## 3. Dónde vive cada pieza

```
unity-client/xr-room/Assets/WebXR/
├── Scripts/
│   ├── WebXRManager.cs        ← recibe mensajes del browser, emite eventos C#
│   ├── WebXRController.cs     ← un controlador (mano izq/der), consume eventos
│   ├── WebXRCamera.cs         ← cámaras estéreo, consume OnHeadsetUpdate
│   ├── WebXRHeadsetData.cs    ← DTO para el JSON de OnWebXRHeadsetData
│   ├── WebXRData.cs / WebXRControllerData.cs  ← DTO para OnWebXRData
│   └── WebXRUI.cs             ← declara displayXRElementId (llamado desde C#)
└── Plugins/WebGL/
    ├── webxr.jslib            ← puente C#→JS (dispatchReactUnityEvent)
    └── webxr.jspre            ← configura el contexto WebGL como xrCompatible
                                  y expone Module.InternalBrowser.requestAnimationFrame

web-client/src/components/unity/
├── UnityViewer.tsx             ← componente que monta Unity + usa el bridge
├── UnityViewer.css
└── webxr/
    ├── WebXRBridge.ts          ← lógica de sesión WebXR + render loop
    ├── useWebXRBridge.ts       ← hook de React
    ├── xrMath.ts               ← conversión de matrices WebGL → Unity
    ├── xrGamepads.ts           ← lectura de gamepads (controles del Quest)
    └── index.ts                ← barrel de exports
```

Los archivos viejos (`Assets/WebGLTemplates/WebXR/webxr.js`, `index.html`,
`vendor/gl-matrix-min.js`) quedaron con un comentario `DEPRECATED` al principio.
Solo importan si algún día se quiere generar un build standalone de Unity fuera
de React para debug rápido — la app real no los toca.

## 4. Cómo trabajar con esto día a día

### A. Agregar un nuevo dato que viaja de Unity → Browser

1. En Unity, creá la función C# en el `.jslib` (`webxr.jslib`) que llame a
   `window.dispatchReactUnityEvent("MiEvento", ...)`.
2. Declarala como `[DllImport("__Internal")] private static extern void MiFuncion(...)`
   en el script C# que la necesite (ver `WebXRUI.cs` como ejemplo mínimo).
3. En React, escuchala con `addEventListener("MiEvento", callback)` — mirá cómo
   `useWebXRBridge.ts` lo hace para `WebXRDisplayMessage`.
4. Actualizá la tabla de la sección 2 de este doc.

### B. Agregar un nuevo dato que viaja de Browser → Unity

1. En Unity, agregá un método público en `WebXRManager.cs` (o el componente que
   corresponda) que reciba un `string` (JSON) o el tipo simple que soporte
   `sendMessage` (`string | number`).
2. En `WebXRBridge.ts`, llamá `this.sendMessage(this.gameObjectName, "MiMetodo", json)`
   en el punto del ciclo de vida que corresponda (`animate`, `attach`, etc.).
3. Si el payload es un objeto, creá un DTO `[System.Serializable]` en C# análogo a
   `WebXRHeadsetData.cs`/`WebXRControllerData.cs`, con nombres de campo que
   coincidan **exactamente** con las claves del JSON (`JsonUtility` es sensible a
   esto, y no soporta campos opcionales/`null` de forma amigable).
4. Actualizá la tabla de la sección 2.

### C. Cambiar el nombre del GameObject `WebXRCameraSet`

Si alguna vez se renombra el GameObject raíz en la escena de Unity, hay que
actualizar **los tres lugares** que lo asumen (hoy no hay una única fuente de verdad):

- `WebXRManager.GlobalName` en `WebXRManager.cs`
- `WEBXR_GAME_OBJECT_NAME` en `UnityViewer.tsx`
- El nombre real del GameObject en la escena (`Assets/WebXR/Prefabs/WebXRCameraSet.prefab`
  o el que se use en la escena de producción)

Si no coinciden, `sendMessage` falla en silencio: no hay excepción, el mensaje
simplemente no llega a nadie. Si los controles/headset dejan de moverse en Quest,
esto es lo primero a revisar.

## 5. Cómo probar en local

### 5.1 Sin Quest (desktop, "modo plano")

1. `cd web-client && npm run dev`
2. Entrar a `/unity-test` (usa `UnityTestPage.tsx` → `UnityViewer`).
3. Confirmar que Unity carga igual que antes de este cambio (esto no debería
   verse afectado por el bridge — si `navigator.xr` no existe o no hay soporte
   VR, `isVRSupported` queda en `false` y el botón "Entrar en VR" ni se muestra).

### 5.2 Con Quest físico

WebXR **requiere HTTPS** (o `localhost`, que el navegador trata como contexto
seguro). Para probar desde el navegador del Quest apuntando a tu máquina de
desarrollo:

1. Levantá el `dev server` de Vite expuesto en la red local, o mejor, desplegá
   a un preview de Vercel (ya sirve HTTPS).
2. Desde el Quest, abrí esa URL en el navegador (Meta Quest Browser / Chrome).
3. Andá a la página con `UnityViewer` y esperá a que cargue Unity.
4. Si `supportsImmersiveVR` es `true`, debería aparecer el botón "Entrar en VR".
   Tocalo (con el mouse virtual del navegador Quest o con el láser del control).
5. Al entrar, deberías ver el render estéreo y que los controles empiecen a
   mover al `WebXRController` correspondiente (`hand = LEFT`/`RIGHT`) en Unity.

### 5.3 Checklist si "no pasa nada" al entrar en VR

En orden de probabilidad:

- [ ] ¿El GameObject en la escena se llama exactamente `WebXRCameraSet`? (ver
  sección 4C). Si no, revisá la consola de Unity: `WebXRManager.Awake()` loguea
  un `Debug.LogError` explícito cuando el nombre no coincide.
- [ ] ¿La build se sirve por HTTPS (o `localhost`)? WebXR no funciona en `http://`
  sobre una IP de red local.
- [ ] ¿`webglContextAttributes: { xrCompatible: true }` sigue estando en
  `UNITY_CONFIG` de `UnityViewer.tsx`? Sin esto, `XRWebGLLayer` puede fallar al
  crearse contra el contexto de Unity.
- [ ] En la consola del navegador, ¿aparece el warning
  `Module.InternalBrowser is missing`? Si sí, `webxr.jspre` no se incluyó en el
  build (revisar que `Assets/WebXR/Plugins/WebGL/webxr.jspre` siga presente y
  que el asmdef/plugin no haya sido excluido de la plataforma WebGL).
- [ ] ¿El objeto `WebXRController` de cada mano tiene asignado su
  `WebXRControllerInputMap` (`XRLeftControllerMap`/`XRRightControllerMap`) en el
  Inspector? Sin eso, `OnEnable()` tira `Debug.LogError` y el controller nunca
  se suscribe a los eventos.
- [ ] ¿Los mensajes `OnWebXRData`/`OnWebXRHeadsetData` están llegando? Agregá un
  `Debug.Log` temporal al inicio de esos métodos en `WebXRManager.cs` para
  confirmarlo mientras se depura.

## 6. Decisiones de diseño (por qué se hizo así)

- **No se usa memoria compartida (`SharedArray`/heap de Emscripten) para las
  matrices de cabeza.** El código original (`XRInitSharedArray`) escribía un
  `Float32Array` directo sobre el buffer interno de Emscripten, algo que (a)
  depende de detalles internos que cambiaron entre versiones de Unity/Emscripten
  y (b) es inseguro en general porque el `ArrayBuffer` subyacente puede
  reemplazarse cuando el heap de WASM crece. En su lugar, las matrices viajan
  como JSON vía `sendMessage`, igual que ya se hacía con los datos de los
  controles — más lento en teoría, imperceptible en la práctica a la frecuencia
  de un frame XR.
- **`Pointer_stringify` fue reemplazado por `UTF8ToString`** en el `.jslib`:
  la primera fue removida de Emscripten hace años y ya ni siquiera tiene un
  shim en Unity 6, así que el `.jslib` original iba a fallar en cuanto Unity
  intentara llamar a `ConfigureToggleXRKeyName`/`displayXRElementId`.
- **Se sigue usando `Assets/WebXR/Plugins/WebGL/webxr.jspre`** para exponer
  `Module.InternalBrowser.requestAnimationFrame`: es la única forma de
  "hijackear" el loop de render de Unity para sincronizarlo con
  `XRSession.requestAnimationFrame`, y como los `.jslib`/`.jspre` quedan
  horneados en el `framework.js` compilado, funciona igual sin importar que el
  loader sea `react-unity-webgl` en vez del `index.html` original.
- **`XRPostRender`/el coroutine de "post-render" de `WebXRCamera.cs` se
  eliminaron.** Era parte de la vieja API WebVR 1.1 (que necesitaba un
  `submitFrame()` explícito); con el WebXR Device API actual alcanza con
  dibujar sobre `glLayer.framebuffer` dentro del callback de
  `requestAnimationFrame` de la sesión — el navegador presenta el frame solo.
  Ya estaba marcado como `// TODO: remove` en el código original.
- **`UNSAFE__unityInstance` de `react-unity-webgl`** es la única forma de llegar
  al `Module` de Unity (canvas, `InternalBrowser`) desde React. Es una API
  marcada como "unsafe" por la librería, pero es necesaria para cualquier
  integración de bajo nivel como esta; se usa solo dentro de `WebXRBridge`,
  nunca se expone al resto de la app.

## 7. Qué falta / posibles mejoras futuras

- **Polyfill de WebXR** (`webxr-polyfill`) para navegadores de escritorio sin
  soporte nativo: hoy `checkSupport()` simplemente devuelve `false` si
  `navigator.xr` no existe. No es necesario para el Quest (tiene soporte
  nativo), pero podría sumarse si se quiere una demo VR-like en desktop.
- **`WebXRToggleKeyName`** no está conectado a nada en React todavía (el atajo
  de teclado para togglear XR manualmente). Si se necesita para debug rápido en
  desktop, hay que agregar un listener en `useWebXRBridge.ts` que llame a
  `enterVR()`/`exitVR()` según corresponda.
- **Sesión `inline`**: se pide igual que en el `webxr.js` original, pero es
  best-effort (no todos los navegadores/branches la soportan igual); si genera
  ruido en consola en algún dispositivo, se puede quitar sin afectar el flujo
  inmersivo (`enterVR`/`exitVR`), que es independiente.

import type { UnityInstance } from "react-unity-webgl";
import { IDENTITY_MATRIX_16, glProjectionToUnity, glViewToUnity } from "./xrMath";
import { getGamepadsFromFrame } from "./xrGamepads";

/**
 * Browser-side WebXR <-> Unity bridge, ported from the original
 * `Assets/WebGLTemplates/WebXR/webxr.js` (Mozilla WebXR Exporter) so it can
 * be driven from React instead of a hand-rolled `index.html`.
 */

const DEFAULT_GAME_OBJECT_NAME = "WebXRCameraSet";

/**
 * Debug: ?webxrDebugMono=1 (or the UI toggle) skips OnStartXR while in VR.
 * Unity keeps the normal 2D main camera (no stereo split / head tracking).
 * Compare mono vs stereo in the headset to isolate CameraL/R + matrices vs presentation.
 */
function readDebugMonoFromUrl(): boolean {
  return (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("webxrDebugMono") === "1"
  );
}

/**
 * Debug: ?webxrDebugClear=1 skips the Unity blit entirely and clears the XR layer to solid
 * magenta every frame. Decisive test for the presentation path: magenta in the headset means
 * session/layer/compositor all work and the problem is the image Unity produces; still-black
 * means the XRWebGLLayer itself isn't reaching the display.
 */
const DEBUG_CLEAR_MODE =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("webxrDebugClear") === "1";

interface UnityEmscriptenGL {
  bindFramebuffer?: (target: number, framebuffer: number) => void;
  framebuffers?: (WebGLFramebuffer | null | undefined)[];
  currentContext?: { GLctx?: WebGL2RenderingContext | WebGLRenderingContext };
  _webxrBindFramebufferPatched?: boolean;
}

interface UnityInternalBrowser {
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  _webxrOriginalRaf?: (callback: FrameRequestCallback) => number;
  _webxrRafHookInstalled?: boolean;
  mainLoop?: {
    resume?: () => void;
    pause?: () => void;
    timingMode?: number;
    timingValue?: number;
    method?: string;
  };
  resumeAsyncCallbacks?: () => void;
}

interface UnityModuleWithInternalBrowser {
  canvas?: HTMLCanvasElement;
  /** Unity's active WebGL context — must be used for XRWebGLLayer, NOT canvas.getContext(). */
  ctx?: WebGL2RenderingContext | WebGLRenderingContext;
  GL?: UnityEmscriptenGL;
  InternalBrowser?: UnityInternalBrowser;
  Browser?: UnityInternalBrowser;
  _webxrActiveBridge?: WebXRBridge | null;
  /** Emscripten API — tells Unity's Screen.width/height to match the canvas drawing buffer. */
  setCanvasSize?: (width: number, height: number, noUpdates?: boolean) => void;
  /**
   * Unity's loader re-derives the canvas/Screen size from the canvas CLIENT size every frame
   * while this is truthy (the react-unity-webgl default) — reverting Screen.SetResolution and
   * stripping any inline width/height we set. It's read per-frame, so it can be toggled off
   * for the duration of an immersive session.
   */
  matchWebGLToCanvasSize?: boolean;
}

export type SendMessageFn = (
  gameObjectName: string,
  methodName: string,
  parameter?: string | number
) => void;

export interface WebXRBridgeOptions {
  gameObjectName?: string;
  sendMessage: SendMessageFn;
  getUnityInstance: () => UnityInstance | null;
  onImmersiveStateChange?: (isInSession: boolean) => void;
}

export class WebXRBridge {
  private readonly gameObjectName: string;
  private readonly sendMessage: SendMessageFn;
  private readonly getUnityInstance: () => UnityInstance | null;
  private readonly onImmersiveStateChange?: (isInSession: boolean) => void;

  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;

  private immersiveSession: XRSession | null = null;
  private immersiveRefSpace: XRReferenceSpace | null = null;
  /**
   * Cached reference to the XRWebGLLayer we just created.
   * IMPORTANT: session.updateRenderState() does NOT apply synchronously — per spec it only
   * takes effect at the start of the next XR animation frame. Reading session.renderState.baseLayer
   * right after calling updateRenderState() (i.e. before the first XR rAF callback has fired) can
   * still return undefined/the old value. We cache the layer ourselves so kickImmersiveRenderLoop
   * can rely on it immediately instead of silently falling back to window.requestAnimationFrame
   * (which Quest pauses/throttles while presenting, leaving the compositor loader stuck forever).
   */
  private immersiveGlLayer: XRWebGLLayer | null = null;
  /**
   * True only while we're actually executing inside session.requestAnimationFrame's callback.
   * Per WebXR spec, an XRWebGLLayer's opaque framebuffer can only be bound/drawn-to/cleared
   * while inside that callback — doing so outside it (e.g. Unity's normal loop firing a stray
   * frame between "immersiveSession is set" and "our first XR rAF callback runs") throws
   * INVALID_FRAMEBUFFER_OPERATION. We gate the framebuffer redirect on this flag instead of
   * just `immersiveSession != null` to avoid redirecting those stray, out-of-frame draws.
   */
  private insideXrFrame = false;

  private rafCallback: FrameRequestCallback | null = null;
  private originalCanvasSize: { width: number; height: number } | null = null;
  private originalCanvasStyle: { width: string; height: string } | null = null;
  /**
   * GL viewport captured right after Unity's frame callback.
   * WARNING: with stereo CameraL/CameraR this is usually only the *last* eye (right half),
   * not the full side-by-side frame. Use {@link getUnityBlitSourceRect} for blitting.
   */
  private lastUnityViewport: { x: number; y: number; w: number; h: number } | null = null;
  /** Last "w x h" sent to Unity via OnXRResolution, to avoid re-sending every frame. */
  private lastSentResolution: string | null = null;
  /** True once the XR layout overrides (position:fixed, max-* none) were applied to the canvas. */
  private xrCanvasLayoutApplied = false;
  private notifiedStartToUnity = false;
  private attached = false;
  private framebufferRedirectInstalled = false;
  private originalBindFramebuffer: WebGL2RenderingContext["bindFramebuffer"] | null = null;
  private originalEmscriptenBindFramebuffer: UnityEmscriptenGL["bindFramebuffer"] | null = null;
  private unityBoundXrFramebufferThisFrame = false;
  private loggedBlitFallback = false;
  private xrCompatibleReady: Promise<void> | null = null;

  isVRSupported = false;

  /**
   * When true, immersive session still presents the XR layer, but Unity is never told to
   * switch to CameraL/CameraR — it keeps CameraMain. Toggle before entering VR.
   */
  private debugMonoMode = readDebugMonoFromUrl();

  constructor(options: WebXRBridgeOptions) {
    this.gameObjectName = options.gameObjectName ?? DEFAULT_GAME_OBJECT_NAME;
    this.sendMessage = options.sendMessage;
    this.getUnityInstance = options.getUnityInstance;
    this.onImmersiveStateChange = options.onImmersiveStateChange;
  }

  /**
   * Always route through the live Unity instance. The React `sendMessage` callback from
   * useUnityContext is often captured while unityInstance is still null (bridge mounts
   * before the instance exists) and then silently no-ops forever.
   */
  private sendToUnity(
    methodName: string,
    parameter?: string | number
  ): void {
    const instance = this.getUnityInstance();
    if (instance?.SendMessage) {
      try {
        if (parameter === undefined) {
          instance.SendMessage(this.gameObjectName, methodName);
        } else {
          instance.SendMessage(this.gameObjectName, methodName, parameter);
        }
        return;
      } catch (err) {
        console.error(
          `[WebXRBridge] SendMessage(${this.gameObjectName}, ${methodName}) falló:`,
          err
        );
      }
    }

    // Fallback for older wiring — may still be a stale no-op.
    this.sendMessage(this.gameObjectName, methodName, parameter);
  }

  get isInImmersiveSession(): boolean {
    return this.immersiveSession != null;
  }

  get isDebugMonoMode(): boolean {
    return this.debugMonoMode;
  }

  setDebugMonoMode(enabled: boolean): void {
    this.debugMonoMode = enabled;
    console.info(
      `[WebXRBridge][diag] debugMonoMode=${enabled ? "ON" : "OFF"} — ` +
        (enabled
          ? "próximo Entrar en VR NO enviará OnStartXR (cámara 2D / mono)."
          : "próximo Entrar en VR usará cámaras estéreo L/R.")
    );
  }

  async checkSupport(): Promise<boolean> {
    if (!navigator.xr) {
      this.isVRSupported = false;
      return false;
    }
    try {
      this.isVRSupported = await navigator.xr.isSessionSupported("immersive-vr");
    } catch {
      this.isVRSupported = false;
    }
    return this.isVRSupported;
  }

  attach(): void {
    if (this.attached) return;

    const module = this.getModule();
    if (!module?.canvas) {
      console.warn("[WebXRBridge] Unity canvas not available yet, cannot attach.");
      return;
    }

    this.attached = true;
    this.canvas = module.canvas;
    this.ensureGlContext(module);

    if (!this.gl) {
      console.error(
        "[WebXRBridge] Could not obtain Unity's WebGL context (Module.ctx / GL.currentContext.GLctx). " +
          "XRWebGLLayer must share the same context Unity renders with."
      );
    } else {
      void this.ensureXrCompatible().catch((err) => {
        console.warn("[WebXRBridge] makeXRCompatible failed during attach:", err);
      });
    }

    this.hookRequestAnimationFrame(module);

    this.sendToUnity(
      "OnXRCapabilities",
      JSON.stringify({
        canPresent: this.isVRSupported,
        hasPosition: true,
        hasExternalDisplay: false,
        supportsImmersiveVR: this.isVRSupported,
      })
    );
  }

  async enterVR(): Promise<void> {
    if (!this.isVRSupported || !navigator.xr) {
      throw new Error("Immersive VR is not supported in this browser/device.");
    }
    if (this.immersiveSession) return;

    const module = this.getModule();
    if (module) this.ensureGlContext(module);
    if (!this.gl || !this.canvas) {
      throw new Error(
        "[WebXRBridge] Unity WebGL context not ready — reload the page and try again after the scene finishes loading."
      );
    }

    // Unity's real render loop (Browser.mainLoop) may not have ticked even once yet if the
    // user hits "Entrar en VR" right after `isLoaded`/loadingProgression hits 1. If we start the
    // XR session before that happens, kickImmersiveRenderLoop has no rafCallback to hand off to
    // and falls back to startBootstrapXrLoop, which only re-blits whatever (stale/empty) content
    // is already in the canvas every frame — Unity's C# game loop never actually renders a new
    // frame, so the headset shows a static/black image forever despite frames "running" fine.
    if (module) {
      const ready = await this.waitForUnityRenderLoop(module);
      if (!ready) {
        console.warn(
          "[WebXRBridge] El main loop de Unity no arrancó a tiempo. Entrando en VR igual, pero " +
            "es probable que la imagen se quede estática/negra hasta que Unity empiece a renderizar."
        );
      }
    }

    const session = await navigator.xr.requestSession("immersive-vr", {
      requiredFeatures: ["local-floor"],
    });

    session.addEventListener("end", this.handleImmersiveSessionEnd);
    await this.onSessionStarted(session);
    this.onImmersiveStateChange?.(true);
  }

  exitVR(): void {
    this.immersiveSession?.end();
  }

  dispose(): void {
    this.immersiveSession?.removeEventListener("end", this.handleImmersiveSessionEnd);
    this.immersiveSession?.end();
    this.immersiveSession = null;

    const module = this.getModule();
    if (module?._webxrActiveBridge === this) {
      module._webxrActiveBridge = null;
    }

    this.attached = false;
    this.removeFramebufferRedirect();
  }

  private getModule(): UnityModuleWithInternalBrowser | null {
    const instance = this.getUnityInstance();
    return (instance?.Module as unknown as UnityModuleWithInternalBrowser) ?? null;
  }

  /** jspre sets InternalBrowser = Browser; ensure the hook target always exists. */
  private ensureInternalBrowser(module: UnityModuleWithInternalBrowser): UnityInternalBrowser {
    if (!module.InternalBrowser) {
      module.InternalBrowser = module.Browser ?? {};
    }
    return module.InternalBrowser;
  }

  private getXrLayer(): XRWebGLLayer | null {
    return (
      this.immersiveGlLayer ??
      (this.immersiveSession?.renderState.baseLayer as XRWebGLLayer | null) ??
      null
    );
  }

  /**
   * Unity WebGL derives Screen.width/height from canvas CSS × devicePixelRatio, NOT from the
   * width/height attributes alone. setCanvasSize() is the official Emscripten hook that keeps
   * Unity's internal resolution in sync with the drawing buffer — without it Unity keeps rendering
   * at the old 2D size (e.g. 928×522) into a corner of the XR-sized backbuffer.
   */
  private syncUnityCanvasSize(width: number, height: number): void {
    if (!this.canvas) return;

    const module = this.getModule();
    const dpr = window.devicePixelRatio || 1;

    // Stop Unity's per-frame canvas-size tracking while presenting: it resets Screen size to the
    // canvas client size (the tiny 2D/VR-page viewport) every frame, undoing setCanvasSize and
    // Screen.SetResolution. Restored on session end.
    if (module && module.matchWebGLToCanvasSize !== false) {
      module.matchWebGLToCanvasSize = false;
      console.info("[WebXRBridge][diag] Module.matchWebGLToCanvasSize desactivado durante la sesión XR.");
    }

    if (
      this.canvas.width !== width ||
      this.canvas.height !== height
    ) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // "important" so neither the .unity-viewer__canvas class (width/height 100%) nor a React
    // re-render reconciling the <Unity style> prop can shrink the client size Unity samples
    // every frame to derive Screen.width/height.
    const cssW = `${width / dpr}px`;
    const cssH = `${height / dpr}px`;
    if (this.canvas.style.getPropertyValue("width") !== cssW) {
      this.canvas.style.setProperty("width", cssW, "important");
    }
    if (this.canvas.style.getPropertyValue("height") !== cssH) {
      this.canvas.style.setProperty("height", cssH, "important");
    }
    if (!this.xrCanvasLayoutApplied) {
      this.xrCanvasLayoutApplied = true;
      // Aggressive fallback: nothing (resets, aspect-ratio containers, flex/grid clamping) may
      // constrain the client size below the XR framebuffer size, so take the canvas out of the
      // normal layout flow entirely while presenting. Restored on session end.
      this.canvas.style.setProperty("max-width", "none", "important");
      this.canvas.style.setProperty("max-height", "none", "important");
      this.canvas.style.setProperty("position", "fixed", "important");
      this.canvas.style.setProperty("top", "0", "important");
      this.canvas.style.setProperty("left", "0", "important");
    }

    module?.setCanvasSize?.(width, height, false);

    // Belt-and-braces: tell Unity the target resolution directly. Requires
    // WebXRManager.OnXRResolution (C#) — on builds that predate it, Unity just logs a missing
    // receiver warning once and everything else keeps working.
    const resolutionKey = `${width}x${height}`;
    if (this.lastSentResolution !== resolutionKey) {
      this.lastSentResolution = resolutionKey;
      this.sendToUnity("OnXRResolution", `${width},${height}`);
    }
  }

  /** Bind + clear the XR framebuffer — required every XR rAF for Quest to dismiss its loader. */
  private presentXrFramebuffer(glLayer: XRWebGLLayer): void {
    if (!this.gl || !this.canvas) return;

    this.syncUnityCanvasSize(glLayer.framebufferWidth, glLayer.framebufferHeight);
    const gl = this.gl;

    // gl.getError() reports ACCUMULATED errors (oldest first). Unity's broken URP shaders on
    // this GPU flood the error queue every frame, so any error we read after our own calls
    // could be theirs, not ours. Drain the queue first so post-clear diagnostics are trustworthy.
    let preexistingErrors = 0;
    let drainedError = gl.getError();
    const firstPreexisting = drainedError;
    while (drainedError !== gl.NO_ERROR && preexistingErrors < 32) {
      preexistingErrors++;
      drainedError = gl.getError();
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
    gl.viewport(0, 0, glLayer.framebufferWidth, glLayer.framebufferHeight);
    // Unity's last frame can leave GL state behind that silently voids our writes to the XR
    // layer: a false colorMask masks clears, an enabled scissor clips clears AND blits, and in
    // ES3 RASTERIZER_DISCARD makes clears no-ops entirely. Force-known state every XR frame.
    gl.colorMask(true, true, true, true);
    gl.disable(gl.SCISSOR_TEST);
    if ("RASTERIZER_DISCARD" in gl) {
      gl.disable((gl as WebGL2RenderingContext).RASTERIZER_DISCARD);
    }
    if (DEBUG_CLEAR_MODE) {
      gl.clearColor(1, 0, 1, 1);
    } else {
      gl.clearColor(0, 0, 0, 1);
    }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    if (DEBUG_CLEAR_MODE && (this.xrFrameCount <= 1 || this.xrFrameCount % 90 === 0)) {
      // Framebuffer completeness of the opaque XR framebuffer, checked INSIDE the session rAF
      // (only place the spec guarantees it can report COMPLETE). 0x8CD5 = FRAMEBUFFER_COMPLETE.
      const fbStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      const clearError = gl.getError();
      console.warn(
        `[WebXRBridge][diag] pre-clear: erroresPrevios(Unity)=${preexistingErrors}` +
          `${preexistingErrors > 0 ? ` primero=0x${firstPreexisting.toString(16)}` : ""} ` +
          `fbStatus=0x${fbStatus.toString(16)} (COMPLETE=0x8cd5) errorDeNuestroClear=0x${clearError.toString(16)} ` +
          `baseLayerAplicado=${this.immersiveSession?.renderState.baseLayer === glLayer}`
      );
      // Read the pixel straight back from the opaque framebuffer: if it isn't magenta, the
      // clear itself is failing (GL state/context issue); if it IS magenta but the headset
      // stays black, the compositor isn't presenting what we write (layer/session issue).
      const px = new Uint8Array(4);
      gl.readPixels(
        Math.floor(glLayer.framebufferWidth / 2),
        Math.floor(glLayer.framebufferHeight / 2),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        px
      );
      console.warn(
        `[WebXRBridge][diag] post-clear XR layer pixel central=(${px.join(",")}) ` +
          `esperado=(255,0,255,255) errorDeReadPixels=0x${gl.getError().toString(16)}`
      );
    }
  }

  private afterUnityRender(glLayer: XRWebGLLayer): void {
    if (!this.gl) return;

    // The viewport right after Unity's callback is the region Unity actually rendered into
    // (URP's final blit sets it to Unity's full logical screen size). Track it every frame so
    // blitCanvasToXrLayer can copy exactly that region even while Unity's size lags the canvas.
    const vp = this.gl.getParameter(this.gl.VIEWPORT) as Int32Array;
    if (vp && vp[2] > 0 && vp[3] > 0) {
      this.lastUnityViewport = { x: vp[0], y: vp[1], w: vp[2], h: vp[3] };
    }

    if (this.xrFrameCount === 1 || this.xrFrameCount % 90 === 0) {
      const scissorOn = this.gl.isEnabled(this.gl.SCISSOR_TEST);
      // Unity derives Screen size from the canvas client rect × devicePixelRatio each frame —
      // log both so we can see exactly what Unity is sampling when the viewport is wrong.
      const rect = this.canvas?.getBoundingClientRect();
      const cs = this.canvas ? getComputedStyle(this.canvas) : null;
      console.info(
        `[WebXRBridge][diag] viewport post-Unity=(${Array.from(vp).join(",")}) ` +
          `scissorTest=${scissorOn} canvas=${this.canvas?.width}x${this.canvas?.height} ` +
          `clientRect=${rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : "?"} ` +
          `dpr=${window.devicePixelRatio} ` +
          `computed=${cs?.width}/${cs?.height} maxW=${cs?.maxWidth} pos=${cs?.position} ` +
          `inline="${this.canvas?.style.cssText}"`
      );
    }

    if (DEBUG_CLEAR_MODE) {
      // Leave the magenta clear from presentXrFramebuffer untouched so the headset shows it.
      if (this.xrFrameCount === 1 || this.xrFrameCount % 90 === 0) {
        console.warn(
          "[WebXRBridge][diag] webxrDebugClear=1: NO se blittea Unity — el layer XR queda magenta. " +
            "Magenta en el visor = el path de presentación funciona; negro = falla la capa XR."
        );
      }
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, glLayer.framebuffer);
      return;
    }
    if (!this.unityBoundXrFramebufferThisFrame) {
      this.blitCanvasToXrLayer(glLayer);
    } else {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, glLayer.framebuffer);
    }
  }

  /**
   * Polls until Unity's Emscripten main loop has actually ticked at least once (Browser.mainLoop
   * exists AND our requestAnimationFrame hook has captured a real Unity frame callback). See the
   * comment in enterVR() for why this matters — without it we can silently end up driving a
   * bootstrap XR loop that never renders anything new.
   */
  private async waitForUnityRenderLoop(
    module: UnityModuleWithInternalBrowser,
    timeoutMs = 4000,
    pollIntervalMs = 50
  ): Promise<boolean> {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      const browser = this.ensureInternalBrowser(module);
      if (browser.mainLoop && this.rafCallback) return true;
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    const browser = this.ensureInternalBrowser(module);
    return !!(browser.mainLoop && this.rafCallback);
  }

  private resumeUnityMainLoop(module: UnityModuleWithInternalBrowser): void {
    const browser = this.ensureInternalBrowser(module);
    browser.mainLoop?.resume?.();
    browser.resumeAsyncCallbacks?.();
  }

  /**
   * Diagnóstico Fase 1: Unity/Emscripten programa su main loop en modo
   * "timeout" (0) o "rAF" (1). En modo timeout, `Browser.requestAnimationFrame`
   * (nuestro hook) nunca se llama con la cadencia esperada durante una sesión
   * inmersiva, y el compositor del Quest se queda esperando un frame que
   * nunca llega -> loader infinito. Si detectamos timingMode !== 1 lo
   * forzamos a rAF (mismo mecanismo que usa Browser.mainLoop.resume()).
   */
  private diagnoseAndFixMainLoopTiming(module: UnityModuleWithInternalBrowser): void {
    const browser = this.ensureInternalBrowser(module);
    const mainLoop = browser.mainLoop;

    if (!mainLoop) {
      console.warn(
        "[WebXRBridge][diag] Browser.mainLoop no existe todavía — Unity puede no haber arrancado su loop."
      );
      return;
    }

    console.info(
      `[WebXRBridge][diag] mainLoop.timingMode=${mainLoop.timingMode} ` +
        `(0=setTimeout, 1=rAF, 2=setImmediate) method="${mainLoop.method}" ` +
        `timingValue=${mainLoop.timingValue}`
    );

    if (mainLoop.timingMode !== 1) {
      console.warn(
        "[WebXRBridge][diag] timingMode no es rAF — forzando a rAF (mode=1) para que el loop " +
          "pase por nuestro hook durante la sesión XR."
      );
      mainLoop.timingMode = 1;
      mainLoop.timingValue = 1;
      // Reconstruye el scheduler para que use el nuevo modo (mismo efecto que
      // llamar _emscripten_set_main_loop_timing(1, 1) desde C/C++).
      browser.mainLoop?.resume?.();
    }
  }

  /**
   * Quest stays on the compositor loader until session.requestAnimationFrame runs
   * and something is drawn to the XRWebGLLayer. Window rAF is paused in VR.
   */
  private kickImmersiveRenderLoop(module: UnityModuleWithInternalBrowser): void {
    this.resumeUnityMainLoop(module);
    this.diagnoseAndFixMainLoopTiming(module);
    const browser = this.ensureInternalBrowser(module);

    if (this.rafCallback && browser.requestAnimationFrame) {
      console.info(
        "[WebXRBridge][diag] kickImmersiveRenderLoop: llamando browser.requestAnimationFrame(rafCallback)."
      );
      try {
        browser.requestAnimationFrame(this.rafCallback);
      } catch (err) {
        console.error(
          "[WebXRBridge][diag] Excepción al llamar browser.requestAnimationFrame(rafCallback):",
          err
        );
      }
      return;
    }

    console.warn(
      `[WebXRBridge] Starting bootstrap XR loop (rafCallback=${!!this.rafCallback}, ` +
        `browser.requestAnimationFrame=${!!browser.requestAnimationFrame}).`
    );
    this.startBootstrapXrLoop();
  }

  private startBootstrapXrLoop(): void {
    const session = this.immersiveSession;
    if (!session || !this.gl) return;

    const loop: XRFrameRequestCallback = (time, frame) => {
      if (!this.immersiveSession) return;

      this.insideXrFrame = true;
      try {
        const glLayer = this.getXrLayer();
        if (glLayer) this.presentXrFramebuffer(glLayer);

        this.animate(frame);

        if (this.rafCallback) {
          this.unityBoundXrFramebufferThisFrame = false;
          this.rafCallback(time);
          if (glLayer) this.afterUnityRender(glLayer);

          const module = this.getModule();
          if (module) {
            const browser = this.ensureInternalBrowser(module);
            browser.requestAnimationFrame?.(this.rafCallback);
          }
          return;
        }

        if (glLayer) this.afterUnityRender(glLayer);
        session.requestAnimationFrame(loop);
      } finally {
        this.insideXrFrame = false;
      }
    };

    session.requestAnimationFrame(loop);
  }

  private ensureGlContext(module: UnityModuleWithInternalBrowser): boolean {
    if (this.gl) return true;

    const resolved = this.resolveGlContext(module);
    if (resolved) {
      this.gl = resolved;
      this.installFramebufferRedirect();
      return true;
    }
    return false;
  }

  private resolveGlContext(
    module: UnityModuleWithInternalBrowser
  ): WebGL2RenderingContext | WebGLRenderingContext | null {
    if (module.ctx) return module.ctx;
    if (module.GL?.currentContext?.GLctx) return module.GL.currentContext.GLctx;

    const globalGl = (globalThis as { GLctx?: WebGL2RenderingContext | WebGLRenderingContext }).GLctx;
    if (globalGl) return globalGl;

    return null;
  }

  private async ensureXrCompatible(): Promise<void> {
    if (!this.gl) return;

    if (!this.xrCompatibleReady) {
      const makeXrCompatible = this.gl.makeXRCompatible?.bind(this.gl);
      this.xrCompatibleReady = makeXrCompatible ? makeXrCompatible() : Promise.resolve();
      this.xrCompatibleReady = this.xrCompatibleReady.catch((err) => {
        this.xrCompatibleReady = null;
        throw err;
      });
    }

    await this.xrCompatibleReady;
  }

  private getXrLayerFramebuffer(): WebGLFramebuffer | null {
    const baseLayer = this.getXrLayer();
    return baseLayer?.framebuffer ?? null;
  }

  /**
   * Disabled: binding Unity's "render to screen" target directly to the XRWebGLLayer's opaque
   * framebuffer breaks as soon as URP internally calls something the WebXR spec forbids against
   * opaque framebuffers (readBuffer, checkFramebufferStatus, etc. — happens during URP's normal
   * passes, e.g. SSAO/MRT), producing INVALID_OPERATION errors and a black/corrupt frame. We
   * always let Unity render to the real canvas backbuffer instead and blit the result into the
   * XR layer afterwards (see blitCanvasToXrLayer / afterUnityRender) — slightly more copying,
   * but avoids every opaque-framebuffer restriction entirely.
   */
  private readonly directFramebufferRedirectEnabled = false;

  private redirectFramebuffer(
    target: GLenum,
    framebuffer: WebGLFramebuffer | null | undefined
  ): WebGLFramebuffer | null {
    if (this.directFramebufferRedirectEnabled && framebuffer == null && this.immersiveSession && this.insideXrFrame) {
      const xrFramebuffer = this.getXrLayerFramebuffer();
      if (xrFramebuffer) {
        this.unityBoundXrFramebufferThisFrame = true;
        return xrFramebuffer;
      }
    }
    return framebuffer ?? null;
  }

  private installFramebufferRedirect(): void {
    if (!this.gl || this.framebufferRedirectInstalled) return;

    const gl = this.gl;
    const bridge = this;
    this.originalBindFramebuffer = gl.bindFramebuffer.bind(gl);

    gl.bindFramebuffer = function (
      target: GLenum,
      framebuffer: WebGLFramebuffer | null
    ): void {
      const redirected = bridge.redirectFramebuffer(target, framebuffer);
      bridge.originalBindFramebuffer!(target, redirected);
    };

    const module = this.getModule();
    const emGl = module?.GL;
    if (emGl?.bindFramebuffer && !emGl._webxrBindFramebufferPatched) {
      this.originalEmscriptenBindFramebuffer = emGl.bindFramebuffer.bind(emGl);
      emGl._webxrBindFramebufferPatched = true;

      emGl.bindFramebuffer = (target: number, framebuffer: number) => {
        if (bridge.directFramebufferRedirectEnabled && bridge.immersiveSession && bridge.insideXrFrame) {
          const xrFramebuffer = bridge.getXrLayerFramebuffer();
          if (xrFramebuffer) {
            const resolved = emGl.framebuffers?.[framebuffer];
            if (framebuffer === 0 || resolved === null || resolved === undefined) {
              bridge.unityBoundXrFramebufferThisFrame = true;
              gl.bindFramebuffer(target, xrFramebuffer);
              return;
            }
          }
        }
        bridge.originalEmscriptenBindFramebuffer!(target, framebuffer);
      };
    }

    this.framebufferRedirectInstalled = true;
  }

  private removeFramebufferRedirect(): void {
    if (!this.gl || !this.framebufferRedirectInstalled) return;

    if (this.originalBindFramebuffer) {
      this.gl.bindFramebuffer = this.originalBindFramebuffer;
      this.originalBindFramebuffer = null;
    }

    const emGl = this.getModule()?.GL;
    if (emGl?._webxrBindFramebufferPatched && this.originalEmscriptenBindFramebuffer) {
      emGl.bindFramebuffer = this.originalEmscriptenBindFramebuffer;
      emGl._webxrBindFramebufferPatched = false;
      this.originalEmscriptenBindFramebuffer = null;
    }

    this.framebufferRedirectInstalled = false;
  }

  private blitCanvasToXrLayer(glLayer: XRWebGLLayer): void {
    if (!this.gl || !this.canvas || !("blitFramebuffer" in this.gl)) return;

    const gl = this.gl as WebGL2RenderingContext;
    const srcW = this.canvas.width;
    const srcH = this.canvas.height;
    if (srcW <= 0 || srcH <= 0) return;

    if (!this.loggedBlitFallback) {
      console.info(
        "[WebXRBridge] URP rendered to the canvas backbuffer — copying color to the XR layer (blit fallback)."
      );
      this.loggedBlitFallback = true;
    }

    // IMPORTANT: gl.bindFramebuffer is patched by installFramebufferRedirect() to redirect any
    // `null` target to the XR layer's opaque framebuffer while a session is active. If we used
    // the patched call here, READ_FRAMEBUFFER would end up pointing at the SAME opaque XR
    // framebuffer as DRAW_FRAMEBUFFER (blitting it onto itself) — and opaque XRWebGLLayer
    // framebuffers can't be used as a read source at all per spec, hence
    // "readBuffer: invalid read buffer" and a black frame. Use the real, unpatched
    // bindFramebuffer to get the actual canvas backbuffer as the read source.
    const rawBindFramebuffer = this.originalBindFramebuffer ?? gl.bindFramebuffer.bind(gl);
    rawBindFramebuffer(gl.READ_FRAMEBUFFER, null);

    // Diagnóstico: samplear el contenido real del canvas ANTES del blit. Si estos píxeles son
    // siempre (0,0,0,255), Unity/URP está renderizando negro al canvas (problema del lado de
    // Unity: cámaras estéreo/URP), no del blit ni de la capa XR.
    if (this.xrFrameCount === 1 || this.xrFrameCount % 90 === 0) {
      const px = new Uint8Array(4);
      let nonBlackCount = 0;
      let firstNonBlack = "";
      // 5x4 grid over the whole canvas to catch content confined to a corner region.
      for (const fy of [0.1, 0.35, 0.65, 0.9]) {
        for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) {
          gl.readPixels(
            Math.floor(srcW * fx),
            Math.floor(srcH * fy),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            px
          );
          if (px[0] > 8 || px[1] > 8 || px[2] > 8) {
            nonBlackCount++;
            if (!firstNonBlack) {
              firstNonBlack = `primer no-negro en (${Math.round(fx * 100)}%,${Math.round(fy * 100)}%)=(${px.join(",")})`;
            }
          }
        }
      }
      console.info(
        `[WebXRBridge][diag] canvas ${srcW}x${srcH} -> xrLayer ` +
          `${glLayer.framebufferWidth}x${glLayer.framebufferHeight} | malla 5x4 pre-blit: ` +
          `${nonBlackCount}/20 píxeles con color. ${firstNonBlack || "TODO NEGRO"}`
      );
    }

    // Source rect: full Unity frame (both eyes when stereo). Do NOT use the raw post-render
    // GL viewport — after CameraL then CameraR, that viewport is only the right half, and
    // stretching it to the whole XR layer makes both eyes see the same flat image.
    const src = this.getUnityBlitSourceRect(srcW, srcH);
    if (this.xrFrameCount === 1 || this.xrFrameCount % 90 === 0) {
      console.info(
        `[WebXRBridge][diag] blit src=(${src.x},${src.y},${src.w},${src.h}) ` +
          `canvas=${srcW}x${srcH} lastVp=${
            this.lastUnityViewport
              ? `(${this.lastUnityViewport.x},${this.lastUnityViewport.y},${this.lastUnityViewport.w},${this.lastUnityViewport.h})`
              : "null"
          }`
      );
    }

    rawBindFramebuffer(gl.DRAW_FRAMEBUFFER, glLayer.framebuffer);
    gl.blitFramebuffer(
      src.x,
      src.y,
      src.x + src.w,
      src.y + src.h,
      0,
      0,
      glLayer.framebufferWidth,
      glLayer.framebufferHeight,
      gl.COLOR_BUFFER_BIT,
      gl.LINEAR
    );
    rawBindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
  }

  /**
   * Resolve the canvas region that contains Unity's full frame for XR presentation.
   * Handles (1) stereo leaving GL viewport on the right eye and (2) Unity still rendering
   * into a smaller corner while Screen size catches up to the XR framebuffer.
   */
  private getUnityBlitSourceRect(
    canvasW: number,
    canvasH: number
  ): { x: number; y: number; w: number; h: number } {
    const vp = this.lastUnityViewport;
    if (!vp || vp.w <= 0 || vp.h <= 0) {
      return { x: 0, y: 0, w: canvasW, h: canvasH };
    }

    // Stereo: CameraR's viewport is typically x≈half, width≈half. Expand to full SBS frame.
    const looksLikeRightEyeOnly = vp.x >= canvasW * 0.25 && vp.w <= canvasW * 0.6;
    const looksLikeLeftEyeOnly = vp.x <= 0 && vp.w <= canvasW * 0.6 && vp.w < canvasW * 0.9;
    if (looksLikeRightEyeOnly || looksLikeLeftEyeOnly) {
      const eyeW = Math.max(vp.w, vp.x > 0 ? vp.x : vp.w);
      const fullW = Math.min(canvasW, eyeW * 2);
      return { x: 0, y: vp.y, w: fullW, h: Math.min(canvasH, vp.h) };
    }

    // Mono / full-frame: Unity may still draw into a top-left sub-rect after resize.
    if (vp.w < canvasW * 0.9 || vp.h < canvasH * 0.9) {
      return {
        x: vp.x,
        y: vp.y,
        w: Math.min(canvasW, vp.w),
        h: Math.min(canvasH, vp.h),
      };
    }

    return { x: 0, y: 0, w: canvasW, h: canvasH };
  }

  private handleImmersiveSessionEnd = (): void => {
    this.immersiveSession = null;
    this.immersiveRefSpace = null;
    this.immersiveGlLayer = null;
    this.insideXrFrame = false;
    this.notifiedStartToUnity = false;
    this.loggedBlitFallback = false;
    this.xrFrameCount = 0;
    this.sendToUnity("OnEndXR", "");

    const endModule = this.getModule();
    if (endModule) endModule.matchWebGLToCanvasSize = true;
    if (this.canvas && this.originalCanvasSize) {
      const { width, height } = this.originalCanvasSize;
      this.canvas.width = width;
      this.canvas.height = height;
      endModule?.setCanvasSize?.(width, height, false);
      this.sendToUnity("OnXRResolution", `${width},${height}`);
    }
    if (this.canvas && this.originalCanvasStyle) {
      // syncUnityCanvasSize set these with priority "important"; a plain `style.width = ...`
      // assignment can't overwrite an !important declaration, so clear them explicitly first.
      this.canvas.style.removeProperty("width");
      this.canvas.style.removeProperty("height");
      this.canvas.style.removeProperty("max-width");
      this.canvas.style.removeProperty("max-height");
      this.canvas.style.removeProperty("position");
      this.canvas.style.removeProperty("top");
      this.canvas.style.removeProperty("left");
      this.xrCanvasLayoutApplied = false;
      if (this.originalCanvasStyle.width) this.canvas.style.width = this.originalCanvasStyle.width;
      if (this.originalCanvasStyle.height) this.canvas.style.height = this.originalCanvasStyle.height;
      this.originalCanvasStyle = null;
    }
    this.lastUnityViewport = null;
    this.lastSentResolution = null;

    this.onImmersiveStateChange?.(false);
    this.removeFramebufferRedirect();
    if (this.gl) this.installFramebufferRedirect();
  };

  private hookRequestAnimationFrame(module: UnityModuleWithInternalBrowser): void {
    const browser = this.ensureInternalBrowser(module);

    if (!browser._webxrRafHookInstalled) {
      browser._webxrOriginalRaf =
        browser.requestAnimationFrame?.bind(browser) ??
        window.requestAnimationFrame.bind(window);

      browser.requestAnimationFrame = (callback: FrameRequestCallback): number => {
        const bridge = module._webxrActiveBridge;
        if (!bridge) {
          console.warn(
            "[WebXRBridge][diag] requestAnimationFrame hook: no hay bridge activo en el Module, " +
              "usando window.requestAnimationFrame (se pausará en VR)."
          );
          return browser._webxrOriginalRaf!(callback);
        }
        return bridge.scheduleUnityFrame(callback, browser._webxrOriginalRaf!);
      };

      browser._webxrRafHookInstalled = true;

      // Unity calls Browser.requestAnimationFrame — keep both in sync when they differ.
      if (module.Browser && module.Browser !== browser) {
        module.Browser.requestAnimationFrame = browser.requestAnimationFrame;
        module.Browser._webxrOriginalRaf = browser._webxrOriginalRaf;
        module.Browser._webxrRafHookInstalled = true;
      }
    }

    module._webxrActiveBridge = this;
  }

  private scheduleUnityFrame(
    callback: FrameRequestCallback,
    originalRaf: (callback: FrameRequestCallback) => number
  ): number {
    this.rafCallback = callback;

    const immersive = this.immersiveSession;
    const glLayer = this.getXrLayer();
    if (immersive && !glLayer) {
      console.warn(
        "[WebXRBridge][diag] scheduleUnityFrame: hay sesión inmersiva pero todavía no hay " +
          "XRWebGLLayer cacheado; usando window.requestAnimationFrame como fallback (se pausará en VR)."
      );
    }
    if (immersive && glLayer) {
      const handle = immersive.requestAnimationFrame((time, frame) => {
        this.insideXrFrame = true;
        try {
          this.presentXrFramebuffer(glLayer);
          this.animate(frame);
          this.unityBoundXrFramebufferThisFrame = false;
          callback(time);
          this.afterUnityRender(glLayer);
        } catch (err) {
          console.error(
            "[WebXRBridge][diag] Excepción dentro del callback de session.requestAnimationFrame:",
            err
          );
        } finally {
          this.insideXrFrame = false;
        }
      });
      if (handle <= 3 || handle % 90 === 0) {
        console.info(
          `[WebXRBridge][diag] session.requestAnimationFrame programado, handle=${handle}`
        );
      }
      this.armXrFrameWatchdog();
      return handle;
    }

    return originalRaf(callback);
  }

  /** Si no llega ningún frame XR en 2s, algo impide que el compositor del Quest reciba data. */
  private armXrFrameWatchdog(): void {
    const framesAtArm = this.xrFrameCount;
    setTimeout(() => {
      if (!this.immersiveSession) return;
      if (this.xrFrameCount === framesAtArm) {
        console.error(
          "[WebXRBridge][diag] WATCHDOG: pasaron 2s desde que se programó el rAF de la sesión XR " +
            "y animate() nunca se ejecutó. El callback de session.requestAnimationFrame no se disparó."
        );
      }
    }, 2000);
  }

  private async onSessionStarted(session: XRSession): Promise<void> {
    try {
      const module = this.getModule();
      if (module) this.ensureGlContext(module);
      if (!this.gl || !this.canvas) {
        console.error("[WebXRBridge][diag] onSessionStarted: falta gl o canvas, abortando.");
        return;
      }

      await this.ensureXrCompatible();

      // Keep layer options minimal. antialias:false is required because we blitFramebuffer the
      // canvas into this layer (blitting INTO a multisampled framebuffer is INVALID_OPERATION).
      // Everything else stays at spec defaults: requesting extras (stencil:true, alpha:false)
      // produced an opaque framebuffer with FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT on Quest
      // Browser — the compositor never allocated its attachments and every write was dropped.
      const glLayer = new XRWebGLLayer(session, this.gl, {
        antialias: false,
      });
      console.info(
        `[WebXRBridge][diag] XRWebGLLayer creado: ${glLayer.framebufferWidth}x` +
          `${glLayer.framebufferHeight} framebuffer=${glLayer.framebuffer ? "ok" : "NULL"} ` +
          `antialias=${glLayer.antialias} ignoreDepthValues=${glLayer.ignoreDepthValues}`
      );
      session.updateRenderState({ baseLayer: glLayer });
      // updateRenderState() is deferred by spec (applies at the start of the next XR animation
      // frame), so we can't rely on session.renderState.baseLayer being readable synchronously.
      // Cache it ourselves so kickImmersiveRenderLoop can use it immediately below.
      this.immersiveGlLayer = glLayer;

      this.originalCanvasSize = { width: this.canvas.width, height: this.canvas.height };
      this.originalCanvasStyle = {
        width: this.canvas.style.width,
        height: this.canvas.style.height,
      };
      this.syncUnityCanvasSize(glLayer.framebufferWidth, glLayer.framebufferHeight);
      console.info(
        `[WebXRBridge][diag] Canvas sincronizado a ${glLayer.framebufferWidth}x` +
          `${glLayer.framebufferHeight} (setCanvasSize + CSS/dpr).`
      );

      const refSpace = await session.requestReferenceSpace("local-floor");
      this.immersiveRefSpace = refSpace;
      this.immersiveSession = session;

      if (module) this.kickImmersiveRenderLoop(module);
    } catch (err) {
      console.error("[WebXRBridge][diag] Excepción dentro de onSessionStarted:", err);
      throw err;
    }
  }

  /** Contador de diagnóstico: si esto no crece en el Quest, el loop XR no está corriendo. */
  private xrFrameCount = 0;

  private animate(frame: XRFrame): void {
    const session = frame.session;
    const refSpace = this.immersiveRefSpace;
    if (!session || !refSpace || !this.gl || !this.canvas) return;

    this.xrFrameCount++;
    if (this.xrFrameCount === 1 || this.xrFrameCount % 90 === 0) {
      console.info(`[WebXRBridge][diag] XR frame #${this.xrFrameCount}`);
    }

    const pose = frame.getViewerPose(refSpace);
    if (!pose) {
      if (this.xrFrameCount === 1 || this.xrFrameCount % 90 === 0) {
        console.warn(
          `[WebXRBridge][diag] XR frame #${this.xrFrameCount}: frame.getViewerPose() devolvió null — ` +
            "Unity NUNCA recibe OnStartXR/OnWebXRHeadsetData mientras esto pase (sigue con la cámara 2D normal)."
        );
      }
      return;
    }

    if (this.xrFrameCount === 1) {
      console.info(
        `[WebXRBridge][diag] XR frame #1: pose válida, ${pose.views.length} view(s): ` +
          pose.views.map((v) => v.eye).join(", ")
      );
    }

    let leftProjectionMatrix: number[] | null = null;
    let leftViewMatrix: number[] | null = null;
    let rightProjectionMatrix: number[] | null = null;
    let rightViewMatrix: number[] | null = null;
    let sitStandMatrix: number[] | null = null;
    let leftPos: DOMPointReadOnly | null = null;
    let rightPos: DOMPointReadOnly | null = null;

    for (const view of pose.views) {
      const viewMatrix = glViewToUnity(view.transform.inverse.matrix);
      if (view.eye === "left") {
        leftProjectionMatrix = glProjectionToUnity(view.projectionMatrix);
        leftViewMatrix = viewMatrix;
        leftPos = view.transform.position;
      } else if (view.eye === "right") {
        rightProjectionMatrix = glProjectionToUnity(view.projectionMatrix);
        rightViewMatrix = viewMatrix;
        rightPos = view.transform.position;
      } else {
        sitStandMatrix = viewMatrix;
      }
    }

    if (leftProjectionMatrix && leftViewMatrix && rightProjectionMatrix && rightViewMatrix) {
      if (this.debugMonoMode) {
        if (!this.notifiedStartToUnity) {
          console.warn(
            "[WebXRBridge][diag] debugMonoMode ON: NO se envía OnStartXR — Unity sigue con " +
              "CameraMain. Igual se manda OnWebXRHeadsetData para poder aplicar pose a la " +
              "cámara main (si el build Unity lo soporta)."
          );
          this.notifiedStartToUnity = true;
        }
      } else if (!this.notifiedStartToUnity) {
        console.info(
          `[WebXRBridge][diag] Enviando OnStartXR a Unity (gameObject="${this.gameObjectName}").`
        );
        // Pass "" — some Unity/react-unity-webgl paths only resolve the string overload.
        this.sendToUnity("OnStartXR", "");
        this.notifiedStartToUnity = true;
      }

      // Always send pose (including mono debug) so head tracking can be tested independently
      // of the CameraL/R switch.
      this.sendToUnity(
        "OnWebXRHeadsetData",
        JSON.stringify({
          leftProjectionMatrix,
          rightProjectionMatrix,
          leftViewMatrix,
          rightViewMatrix,
          sitStandMatrix: sitStandMatrix ?? IDENTITY_MATRIX_16,
        })
      );

      if (this.xrFrameCount === 1 || this.xrFrameCount % 90 === 0) {
        // Log the raw WebXR eye positions (not matrix indices — after transpose those
        // look like zeros and falsely suggest "no tracking").
        const lp = leftPos;
        const rp = rightPos;
        const viewer = pose.transform.position;
        console.info(
          `[WebXRBridge][diag] pose -> Unity mono=${this.debugMonoMode} ` +
            `viewer=(${viewer.x.toFixed(3)},${viewer.y.toFixed(3)},${viewer.z.toFixed(3)}) ` +
            `L=(${lp ? `${lp.x.toFixed(3)},${lp.y.toFixed(3)},${lp.z.toFixed(3)}` : "?"}) ` +
            `R=(${rp ? `${rp.x.toFixed(3)},${rp.y.toFixed(3)},${rp.z.toFixed(3)}` : "?"}) ` +
            `| esperá ACK "xr-started" y viewport ~mitad de ancho si OnStartXR llegó`
        );
      }
    }

    this.sendToUnity(
      "OnWebXRData",
      JSON.stringify({
        controllers: getGamepadsFromFrame(frame, refSpace),
      })
    );
  }
}

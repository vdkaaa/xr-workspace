import type { UnityInstance } from "react-unity-webgl";
import { IDENTITY_MATRIX_16, glProjectionToUnity, glViewToUnity } from "./xrMath";
import { getGamepadsFromFrame } from "./xrGamepads";

/**
 * Browser-side WebXR <-> Unity bridge, ported from the original
 * `Assets/WebGLTemplates/WebXR/webxr.js` (Mozilla WebXR Exporter) so it can
 * be driven from React instead of a hand-rolled `index.html`.
 *
 * Key differences from the original:
 * - Uses `sendMessage` from `useUnityContext` instead of the old
 *   `gameInstance.SendMessage` (react-unity-webgl / modern Unity loader API).
 * - Headset matrices are sent as JSON via `sendMessage(..., "OnWebXRHeadsetData", json)`
 *   instead of being written into a raw Emscripten heap Float32Array
 *   (`SharedArray`). That mechanism relied on a global `buffer` variable from
 *   the old asm.js-era Emscripten output, which no longer exists as such in
 *   the Emscripten/WASM runtime Unity 6 ships — and was unsafe regardless,
 *   since the underlying ArrayBuffer is replaced whenever the WASM heap grows.
 * - Render-loop hijacking (`InternalBrowser.requestAnimationFrame`) still
 *   relies on `Assets/WebXR/Plugins/WebGL/webxr.jspre`, which keeps working
 *   unchanged because jslib/jspre files are baked into Unity's compiled
 *   framework.js regardless of which JS loader wrapper is used on top.
 */

const DEFAULT_GAME_OBJECT_NAME = "WebXRCameraSet";

// `Module.InternalBrowser` is set up by webxr.jspre; it isn't part of
// react-unity-webgl's public UnityModule type, so we extend it locally.
interface UnityModuleWithInternalBrowser {
  canvas?: HTMLCanvasElement;
  InternalBrowser?: {
    requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  };
}

export type SendMessageFn = (
  gameObjectName: string,
  methodName: string,
  parameter?: string | number
) => void;

export interface WebXRBridgeOptions {
  /** Name of the Unity GameObject holding WebXRManager. Must match WebXRManager.GlobalName. */
  gameObjectName?: string;
  sendMessage: SendMessageFn;
  /** Lazily resolves the live Unity instance (may be null before/after load). */
  getUnityInstance: () => UnityInstance | null;
  /** Notified whenever an immersive-vr session starts or ends. */
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
  private inlineSession: XRSession | null = null;
  private immersiveRefSpace: XRReferenceSpace | null = null;
  private inlineRefSpace: XRReferenceSpace | null = null;

  private rafCallback: FrameRequestCallback | null = null;
  private originalCanvasSize: { width: number; height: number } | null = null;
  private notifiedStartToUnity = false;
  private attached = false;

  isVRSupported = false;

  constructor(options: WebXRBridgeOptions) {
    this.gameObjectName = options.gameObjectName ?? DEFAULT_GAME_OBJECT_NAME;
    this.sendMessage = options.sendMessage;
    this.getUnityInstance = options.getUnityInstance;
    this.onImmersiveStateChange = options.onImmersiveStateChange;
  }

  get isInImmersiveSession(): boolean {
    return this.immersiveSession != null;
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

  /**
   * Wires up the render loop hook and tells Unity about browser capabilities.
   * Call once after Unity finished loading (`isLoaded === true`).
   */
  attach(): void {
    if (this.attached) return;

    const module = this.getModule();
    if (!module?.canvas) {
      console.warn("[WebXRBridge] Unity canvas not available yet, cannot attach.");
      return;
    }

    this.attached = true;
    this.canvas = module.canvas;
    this.gl = (this.canvas.getContext("webgl2") ??
      this.canvas.getContext("webgl")) as WebGL2RenderingContext | WebGLRenderingContext | null;

    if (!this.gl) {
      console.error("[WebXRBridge] Could not obtain a WebGL context from Unity's canvas.");
    }

    this.hookRequestAnimationFrame(module);

    this.sendMessage(
      this.gameObjectName,
      "OnXRCapabilities",
      JSON.stringify({
        canPresent: this.isVRSupported,
        hasPosition: true,
        hasExternalDisplay: false,
        supportsImmersiveVR: this.isVRSupported,
      })
    );

    // Mirrors the original webxr.js behaviour of also requesting an 'inline'
    // session so the non-immersive view can still receive an XR ref space.
    // This is best-effort: not every browser/config supports it, and it
    // isn't required for immersive-vr to work.
    navigator.xr
      ?.requestSession("inline")
      .then((session) => {
        this.inlineSession = session;
        this.onSessionStarted(session);
      })
      .catch(() => {
        /* inline session is optional */
      });
  }

  async enterVR(): Promise<void> {
    if (!this.isVRSupported || !navigator.xr) {
      throw new Error("Immersive VR is not supported in this browser/device.");
    }
    if (this.immersiveSession) return;

    const session = await navigator.xr.requestSession("immersive-vr", {
      requiredFeatures: ["local-floor"],
    });

    this.immersiveSession = session;
    session.addEventListener("end", this.handleImmersiveSessionEnd);
    this.onSessionStarted(session);
    this.onImmersiveStateChange?.(true);
  }

  exitVR(): void {
    this.immersiveSession?.end();
  }

  dispose(): void {
    this.immersiveSession?.removeEventListener("end", this.handleImmersiveSessionEnd);
    this.immersiveSession?.end();
    this.immersiveSession = null;
    this.inlineSession?.end();
    this.inlineSession = null;
  }

  private getModule(): UnityModuleWithInternalBrowser | null {
    const instance = this.getUnityInstance();
    return (instance?.Module as unknown as UnityModuleWithInternalBrowser) ?? null;
  }

  private handleImmersiveSessionEnd = (): void => {
    this.immersiveSession = null;
    this.immersiveRefSpace = null;
    this.notifiedStartToUnity = false;
    this.sendMessage(this.gameObjectName, "OnEndXR");

    if (this.canvas && this.originalCanvasSize) {
      this.canvas.width = this.originalCanvasSize.width;
      this.canvas.height = this.originalCanvasSize.height;
    }

    this.onImmersiveStateChange?.(false);
  };

  private hookRequestAnimationFrame(module: UnityModuleWithInternalBrowser): void {
    if (!module.InternalBrowser) {
      console.warn(
        "[WebXRBridge] Module.InternalBrowser is missing — is webxr.jspre included in the build?"
      );
      return;
    }

    const originalRaf = module.InternalBrowser.requestAnimationFrame?.bind(module.InternalBrowser);

    module.InternalBrowser.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      if (!this.rafCallback) {
        this.rafCallback = callback;
      }

      if (this.immersiveSession) {
        return this.immersiveSession.requestAnimationFrame((time, frame) => {
          this.animate(frame);
          callback(time);
        });
      }

      if (this.inlineSession) {
        return this.inlineSession.requestAnimationFrame((time) => callback(time));
      }

      return (originalRaf ?? window.requestAnimationFrame)(callback);
    };
  }

  private onSessionStarted(session: XRSession): void {
    if (!this.gl || !this.canvas) return;

    const isImmersive = session === this.immersiveSession;
    const glLayer = new XRWebGLLayer(session, this.gl);
    session.updateRenderState({ baseLayer: glLayer });

    if (isImmersive) {
      this.originalCanvasSize = { width: this.canvas.width, height: this.canvas.height };
      this.canvas.width = glLayer.framebufferWidth;
      this.canvas.height = glLayer.framebufferHeight;
    }

    const refSpaceType: XRReferenceSpaceType = isImmersive ? "local-floor" : "viewer";

    session.requestReferenceSpace(refSpaceType).then((refSpace) => {
      if (isImmersive) {
        this.immersiveRefSpace = refSpace;
        // Kick off the render loop now that we have a reference space.
        const module = this.getModule();
        if (this.rafCallback && module?.InternalBrowser?.requestAnimationFrame) {
          module.InternalBrowser.requestAnimationFrame(this.rafCallback);
        }
      } else {
        this.inlineRefSpace = refSpace;
      }
    });
  }

  private animate(frame: XRFrame): void {
    const session = frame.session;
    const refSpace = this.immersiveRefSpace;
    if (!session || !refSpace || !this.gl || !this.canvas) return;

    const pose = frame.getViewerPose(refSpace);
    if (!pose) return;

    const glLayer = session.renderState.baseLayer;
    if (!glLayer) return;

    this.canvas.width = glLayer.framebufferWidth;
    this.canvas.height = glLayer.framebufferHeight;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, glLayer.framebuffer);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

    let leftProjectionMatrix: number[] | null = null;
    let leftViewMatrix: number[] | null = null;
    let rightProjectionMatrix: number[] | null = null;
    let rightViewMatrix: number[] | null = null;
    let sitStandMatrix: number[] | null = null;

    for (const view of pose.views) {
      const viewMatrix = glViewToUnity(view.transform.inverse.matrix);
      if (view.eye === "left") {
        leftProjectionMatrix = glProjectionToUnity(view.projectionMatrix);
        leftViewMatrix = viewMatrix;
      } else if (view.eye === "right") {
        rightProjectionMatrix = glProjectionToUnity(view.projectionMatrix);
        rightViewMatrix = viewMatrix;
      } else {
        sitStandMatrix = viewMatrix;
      }
    }

    if (leftProjectionMatrix && leftViewMatrix && rightProjectionMatrix && rightViewMatrix) {
      this.sendMessage(
        this.gameObjectName,
        "OnWebXRHeadsetData",
        JSON.stringify({
          leftProjectionMatrix,
          rightProjectionMatrix,
          leftViewMatrix,
          rightViewMatrix,
          sitStandMatrix: sitStandMatrix ?? IDENTITY_MATRIX_16,
        })
      );
    }

    if (!this.notifiedStartToUnity) {
      this.sendMessage(this.gameObjectName, "OnStartXR");
      this.notifiedStartToUnity = true;
    }

    this.sendMessage(
      this.gameObjectName,
      "OnWebXRData",
      JSON.stringify({
        controllers: getGamepadsFromFrame(frame, refSpace),
      })
    );
  }
}

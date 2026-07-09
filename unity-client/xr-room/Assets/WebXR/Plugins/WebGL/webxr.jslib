/*
 * Functions called from C# (Unity -> Browser).
 *
 * These dispatch events using `window.dispatchReactUnityEvent`, the mechanism
 * exposed by react-unity-webgl (see web-client/src/components/unity/webxr).
 * The browser-side bridge (WebXRBridge.ts) registers listeners for these via
 * `addEventListener` on the Unity context returned by `useUnityContext`.
 *
 * NOTE: this used to use `Pointer_stringify`, an Emscripten helper removed
 * years ago (deprecated since Unity 2021.2, since removed). Any project still
 * using it will fail at runtime with "Pointer_stringify is not defined" as
 * soon as this function is invoked. Use `UTF8ToString` instead.
 *
 * This also used to keep a raw Float32Array view over Emscripten's internal
 * heap buffer (`XRInitSharedArray`/`ListenWebXRData`) to pass headset
 * matrices to C#. That relied on a global `buffer` variable that no longer
 * exists in the Emscripten runtime Unity 6 ships, and was unsafe anyway
 * (the underlying ArrayBuffer can be replaced whenever the WASM heap grows).
 * Headset data is now sent the same way controller data always was: as a
 * JSON string via `sendMessage(gameObjectName, "OnWebXRHeadsetData", json)`
 * from WebXRBridge.ts directly, so there is nothing left to bridge here for it.
 */
mergeInto(LibraryManager.library, {
  // Declared in WebXRManager.cs. Lets the browser bridge know which keyboard
  // key (if any) should be treated as the "toggle XR" shortcut.
  ConfigureToggleXRKeyName: function (keyName) {
    if (typeof window.dispatchReactUnityEvent !== 'function') return;
    window.dispatchReactUnityEvent('WebXRToggleKeyName', UTF8ToString(keyName));
  },

  // Declared in WebXRUI.cs. Asks the React app to surface a message/banner
  // identified by `id` (e.g. "novr" when the browser doesn't support WebXR).
  displayXRElementId: function (id) {
    if (typeof window.dispatchReactUnityEvent !== 'function') return;
    window.dispatchReactUnityEvent('WebXRDisplayMessage', UTF8ToString(id));
  },
});

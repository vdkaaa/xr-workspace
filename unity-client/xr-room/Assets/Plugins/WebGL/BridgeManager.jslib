mergeInto(LibraryManager.library, {
  DispatchUnityEvent: function (eventNamePtr, jsonPtr) {
    var eventName = UTF8ToString(eventNamePtr);
    var json = UTF8ToString(jsonPtr);
    if (typeof window.dispatchReactUnityEvent === "function") {
      window.dispatchReactUnityEvent(eventName, json);
    } else {
      console.warn("[BridgeManager] dispatchReactUnityEvent no disponible todavía");
    }
  }
});

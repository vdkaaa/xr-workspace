// Exposes `Module.InternalBrowser.requestAnimationFrame` so the browser-side
// bridge (web-client/src/components/unity/webxr/WebXRBridge.ts) can hijack
// Unity's render loop while an immersive XR session is active, and forces
// the WebGL context to be `xrCompatible`. The `webglContextAttributes:
// { xrCompatible: true }` option passed to `useUnityContext` in
// UnityViewer.tsx does the same for the officially supported code path; this
// stays as a defensive fallback in case that option isn't honored.
setTimeout(function () {
    Module['InternalBrowser'] = Browser || {};
    if (GL && GL.createContext)
    {
        GL.createContextOld = GL.createContext;
        GL.createContext = function (canvas, webGLContextAttributes)
        {
            var contextAttributes = {
                xrCompatible: true
            };

            if (webGLContextAttributes) {
                for (var attribute in webGLContextAttributes) {
                    contextAttributes[attribute] = webGLContextAttributes[attribute];
                }
            }
            
            return GL.createContextOld(canvas, contextAttributes);
        }
    }
}, 0);
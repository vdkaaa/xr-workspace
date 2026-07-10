// Runs before Unity creates the WebGL context so xrCompatible is set at creation time.
(function () {
    // IMPORTANT: this .jspre snippet is inlined very early in the generated runtime script —
    // BEFORE Emscripten's own `var Browser = {...}` (with mainLoop/requestAnimationFrame) has
    // executed. Capturing `Browser` right now would just grab `undefined` (hoisted, not yet
    // assigned) and permanently store an empty, disconnected `{}` stub on Module, which is what
    // was happening before this fix: WebXRBridge's patches on Module.InternalBrowser were
    // silently inert because Unity's real main loop talks to the actual `Browser` object, not
    // our orphaned stub. Defer the assignment to onRuntimeInitialized, which fires after
    // initRuntime() — by then `Browser` is fully populated — so Module.InternalBrowser is a
    // real, live reference that WebXRBridge.ts can patch (requestAnimationFrame, mainLoop, etc.)
    // and have Unity's actual scheduling pick up the patch.
    var origOnRuntimeInitialized = Module['onRuntimeInitialized'];
    Module['onRuntimeInitialized'] = function () {
        Module['InternalBrowser'] = Browser;
        if (origOnRuntimeInitialized) origOnRuntimeInitialized();
    };

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

        // Expose the GL context on Module for WebXRBridge.ts (Module.ctx).
        if (GL.createContextOld) {
            var createContextWithModuleCtx = GL.createContext;
            GL.createContext = function (canvas, webGLContextAttributes) {
                var handle = createContextWithModuleCtx(canvas, webGLContextAttributes);
                if (GL.currentContext && GL.currentContext.GLctx) {
                    Module.ctx = GL.currentContext.GLctx;
                }
                return handle;
            };
        }

        // URP final blit can sample with wrong ScaleBias in WebXR.
        if (GL.getSource && !GL.getSourceOld) {
            GL.getSourceOld = GL.getSource;
            GL.getSource = function (shader, count, string, length) {
                var source = GL.getSourceOld(shader, count, string, length);
                if (source && source.indexOf('vs_TEXCOORD0.xy = u_xlat1.xw * _ScaleBias.xy + _ScaleBias.zw;') !== -1) {
                    source = source.replace(
                        'vs_TEXCOORD0.xy = u_xlat1.xw * _ScaleBias.xy + _ScaleBias.zw;',
                        'vs_TEXCOORD0.xy = u_xlat1.xw * vec2(1.0, 1.0);'
                    );
                }
                return source;
            };
        }
    }
})();

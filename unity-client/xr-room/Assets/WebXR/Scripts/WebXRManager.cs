using UnityEngine;
using System.Runtime.InteropServices;
using UnityEngine.Scripting;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace WebXR
{
    public enum WebXRState
    {
        ENABLED,
        NORMAL
    }

    public class WebXRManager : MonoBehaviour
    {
        [Tooltip("Name of the key used to alternate between XR and normal mode. Leave blank to disable.")]
        public string toggleXRKeyName;

        [Tooltip("Preserve the manager across scenes changes.")]
        public bool dontDestroyOnLoad = true;

        [Header("Tracking")] [Tooltip("Default height of camera if no room-scale transform is present.")]
        public float DefaultHeight = 1.2f;

        private static string GlobalName = "WebXRCameraSet";
        private static WebXRManager instance;
        [HideInInspector] public WebXRState xrState = WebXRState.NORMAL;

        public delegate void XRCapabilitiesUpdate(WebXRDisplayCapabilities capabilities);

        public event XRCapabilitiesUpdate OnXRCapabilitiesUpdate;

        public delegate void XRChange(WebXRState state);

        public event XRChange OnXRChange;

        // Parameter order must match OnWebXRHeadsetData / WebXRCamera.onHeadsetUpdate:
        // leftProj, rightProj, leftView, rightView, sitStand (all Matrix4x4 — names matter for callers).
        public delegate void HeadsetUpdate(
            Matrix4x4 leftProjectionMatrix,
            Matrix4x4 rightProjectionMatrix,
            Matrix4x4 leftViewMatrix,
            Matrix4x4 rightViewMatrix,
            Matrix4x4 sitStandMatrix);

        public event HeadsetUpdate OnHeadsetUpdate;

        public delegate void ControllerUpdate(string id,
            int index,
            string hand,
            bool hasOrientation,
            bool hasPosition,
            Quaternion orientation,
            Vector3 position,
            Vector3 linearAcceleration,
            Vector3 linearVelocity,
            WebXRControllerButton[] buttons,
            float[] axes);

        public event ControllerUpdate OnControllerUpdate;

        // link WebGL plugin for interacting with browser scripts.
        [DllImport("__Internal")]
        private static extern void ConfigureToggleXRKeyName(string keyName);

        private WebXRDisplayCapabilities _capabilities;

        public static WebXRManager Instance
        {
            get
            {
                if (!instance)
                {
                    var managerInScene = FindAnyObjectByType<WebXRManager>();
                    var name = GlobalName;

                    if (managerInScene != null)
                    {
                        instance = managerInScene;
                        instance.name = name;
                    }
                    else
                    {
                        GameObject go = new GameObject(name);
                        go.AddComponent<WebXRManager>();
                    }
                }

                return instance;
            }
        }

        private void Awake()
        {
            Debug.Log("Active Graphics Tier: " + Graphics.activeTier);
            instance = this;

            if (!GlobalName.Equals(name))
            {
                Debug.LogError("The webxr.js script requires the WebXRManager gameobject to be named "
                               + GlobalName + " for proper functioning");
            }

            if (dontDestroyOnLoad)
            {
                DontDestroyOnLoad(instance);
            }
        }

        // Handles WebXR data from browser
        public void OnWebXRData(string jsonString)
        {
            WebXRData webXRData = WebXRData.CreateFromJSON(jsonString);

            // Update controllers
            foreach (WebXRControllerData controllerData in webXRData.controllers)
            {
                if (OnControllerUpdate != null)
                    OnControllerUpdate(controllerData.id,
                        controllerData.index,
                        controllerData.hand,
                        controllerData.hasOrientation,
                        controllerData.hasPosition,
                        new Quaternion(controllerData.orientation[0], controllerData.orientation[1],
                            controllerData.orientation[2], controllerData.orientation[3]),
                        new Vector3(controllerData.position[0], controllerData.position[1],
                            controllerData.position[2]),
                        new Vector3(controllerData.linearAcceleration[0], controllerData.linearAcceleration[1],
                            controllerData.linearAcceleration[2]),
                        new Vector3(controllerData.linearVelocity[0], controllerData.linearVelocity[1],
                            controllerData.linearVelocity[2]),
                        controllerData.buttons,
                        controllerData.axes);
            }
        }

        // Handles headset (HMD) pose/projection data from the browser bridge.
        // Called every XR frame via sendMessage(gameObjectName, "OnWebXRHeadsetData", json)
        // from web-client's WebXRBridge (see web-client/src/components/unity/webxr).
        // [Preserve]: only invoked via JS SendMessage — IL2CPP must not strip it.
        [Preserve]
        public void OnWebXRHeadsetData(string jsonString)
        {
            // Do not require xrState == ENABLED: mono debug keeps NORMAL but still needs pose
            // on CameraMain. Stereo path sets ENABLED via OnStartXR before useful frames arrive.
            if (OnHeadsetUpdate == null) return;

            WebXRHeadsetData headsetData = WebXRHeadsetData.CreateFromJSON(jsonString);
            if (headsetData == null ||
                headsetData.leftProjectionMatrix == null ||
                headsetData.rightProjectionMatrix == null ||
                headsetData.leftViewMatrix == null ||
                headsetData.rightViewMatrix == null)
            {
                return;
            }

            if (headsetData.leftProjectionMatrix.Length < 16 ||
                headsetData.rightProjectionMatrix.Length < 16 ||
                headsetData.leftViewMatrix.Length < 16 ||
                headsetData.rightViewMatrix.Length < 16)
            {
                return;
            }

            Matrix4x4 leftProjectionMatrix = WebXRMatrixUtil.NumbersToMatrix(headsetData.leftProjectionMatrix);
            Matrix4x4 rightProjectionMatrix = WebXRMatrixUtil.NumbersToMatrix(headsetData.rightProjectionMatrix);
            Matrix4x4 leftViewMatrix = WebXRMatrixUtil.NumbersToMatrix(headsetData.leftViewMatrix);
            Matrix4x4 rightViewMatrix = WebXRMatrixUtil.NumbersToMatrix(headsetData.rightViewMatrix);
            Matrix4x4 sitStandMatrix = headsetData.sitStandMatrix != null && headsetData.sitStandMatrix.Length >= 16
                ? WebXRMatrixUtil.NumbersToMatrix(headsetData.sitStandMatrix)
                : Matrix4x4.identity;

            OnHeadsetUpdate(
                leftProjectionMatrix,
                rightProjectionMatrix,
                leftViewMatrix,
                rightViewMatrix,
                sitStandMatrix);
        }

        // Handles WebXR capabilities from browser
        public void OnXRCapabilities(string json)
        {
            WebXRDisplayCapabilities capabilities = JsonUtility.FromJson<WebXRDisplayCapabilities>(json);
            OnXRCapabilities(capabilities);
        }

        public void OnXRCapabilities(WebXRDisplayCapabilities capabilities)
        {
#if UNITY_EDITOR
            // Nothing to do
#elif UNITY_WEBGL
            _capabilities = capabilities;
            if (!capabilities.supportsImmersiveVR)
                WebXRUI.displayXRElementId("novr");
#endif

            if (OnXRCapabilitiesUpdate != null)
                OnXRCapabilitiesUpdate(capabilities);
        }

        public void toggleXrState()
        {
#if UNITY_EDITOR
            // No editor specific functionality
#elif UNITY_WEBGL
            if (this.xrState == WebXRState.ENABLED)
                setXrState(WebXRState.NORMAL);
            else
                setXrState(WebXRState.ENABLED);
#endif
        }

        public void setXrState(WebXRState state)
        {
            xrState = state;

            if (OnXRChange != null)
                OnXRChange(state);
        }

        // Received from the browser bridge as "width,height" (XR framebuffer pixels).
        // Unity WebGL normally derives Screen size from the canvas client size, which can lag or
        // be overridden by page CSS while presenting to the headset — Screen.SetResolution pins
        // the render resolution from inside Unity so the whole XR framebuffer gets rendered.
        public void OnXRResolution(string resolution)
        {
#if !UNITY_EDITOR && UNITY_WEBGL
            string[] parts = resolution.Split(',');
            int width, height;
            if (parts.Length == 2 &&
                int.TryParse(parts[0], out width) &&
                int.TryParse(parts[1], out height) &&
                width > 0 && height > 0 &&
                (Screen.width != width || Screen.height != height))
            {
                Debug.Log($"WebXRManager.OnXRResolution: {Screen.width}x{Screen.height} -> {width}x{height}");
                Screen.SetResolution(width, height, FullScreenMode.Windowed);
            }
#endif
        }

        // received start VR from WebXR browser
        // Overloads: react-unity-webgl sometimes sends "" as the 3rd SendMessage arg.
        [Preserve]
        public void OnStartXR()
        {
            Debug.Log("WebXRManager.OnStartXR()");
            WebXRUI.displayXRElementId("xr-started");
            Instance.setXrState(WebXRState.ENABLED);
        }

        [Preserve]
        public void OnStartXR(string _unused)
        {
            OnStartXR();
        }

        // receive end VR from WebVR browser
        [Preserve]
        public void OnEndXR()
        {
            Debug.Log("WebXRManager.OnEndXR()");
            Instance.setXrState(WebXRState.NORMAL);
        }

        [Preserve]
        public void OnEndXR(string _unused)
        {
            OnEndXR();
        }

        void Start()
        {
#if UNITY_EDITOR
            // No editor specific functionality
#elif UNITY_WEBGL
            ConfigureToggleXRKeyName(toggleXRKeyName);
#endif
        }

        void Update()
        {
#if UNITY_EDITOR || !UNITY_WEBGL
            if (string.IsNullOrEmpty(toggleXRKeyName))
                return;

            // Only used to test XR toggling from within the Editor / non-WebGL players.
            // Supports both Input System configurations (activeInputHandler) so it
            // doesn't throw when the legacy Input Manager is disabled.
#if ENABLE_INPUT_SYSTEM
            if (Keyboard.current != null &&
                System.Enum.TryParse(toggleXRKeyName, true, out Key key) &&
                Keyboard.current[key].wasReleasedThisFrame)
            {
                toggleXrState();
            }
#else
            if (Input.GetKeyUp(toggleXRKeyName))
                toggleXrState();
#endif
#endif
        }

    }
}

using UnityEngine;
using WebXR;

namespace XRRooms.Bridge
{
    /// <summary>
    /// Periodically sends the local player's transform to React as LOCAL_TRANSFORM.
    /// Desktop moves CameraMain; VR tracking uses the WebXRCameraSet root — pick by xrState.
    /// </summary>
    public class LocalTransformEmitter : MonoBehaviour
    {
        [SerializeField] private BridgeManager bridgeManager;

        // Desktop: camera moved by DesertFreeFlightController (e.g. CameraMain).
        [SerializeField] private Transform desktopTransform;

        // VR: root moved by WebXR tracking (e.g. WebXRCameraSet).
        [SerializeField] private Transform vrTransform;

        [SerializeField] private float sendIntervalSeconds = 0.1f;

        private void Awake()
        {
            if (vrTransform == null)
            {
                var rig = GameObject.Find("WebXRCameraSet");
                if (rig != null) vrTransform = rig.transform;
            }

            if (desktopTransform == null)
            {
                // Prefer CameraMain under the VR rig; do NOT use Camera.main (ambiguous).
                Transform searchRoot = vrTransform != null ? vrTransform : transform;
                var cameraMain = searchRoot.Find("Cameras/CameraMain");
                if (cameraMain == null)
                {
                    var go = GameObject.Find("CameraMain");
                    if (go != null) cameraMain = go.transform;
                }
                desktopTransform = cameraMain;
            }

            if (desktopTransform == null && vrTransform == null)
            {
                Debug.LogError(
                    "[LocalTransformEmitter] ni desktopTransform ni vrTransform asignados"
                );
                enabled = false;
            }
        }

        private void Start()
        {
            if (bridgeManager != null && (desktopTransform != null || vrTransform != null))
            {
                InvokeRepeating(
                    nameof(EmitTransform),
                    sendIntervalSeconds,
                    sendIntervalSeconds
                );
            }
        }

        private void OnDisable()
        {
            CancelInvoke();
        }

        private void EmitTransform()
        {
            if (bridgeManager == null) return;
            if (!bridgeManager.IsAuthenticated) return;

            Transform active = ResolveActiveTransform();
            if (active == null) return;

            Debug.Log($"[LocalTransformEmitter] modo={(WebXRManager.Instance != null ? WebXRManager.Instance.xrState.ToString() : "null")} transform={active.name} pos={active.position}");
            bridgeManager.SendLocalTransform(active.position, active.rotation);
        }

        private Transform ResolveActiveTransform()
        {
            // WebXRManager.xrState is the same signal DesertFreeFlightController / WebXRCamera use.
            bool inVr =
                WebXRManager.Instance != null &&
                WebXRManager.Instance.xrState == WebXRState.ENABLED;

            if (inVr)
            {
                return vrTransform != null ? vrTransform : desktopTransform;
            }

            return desktopTransform != null ? desktopTransform : vrTransform;
        }
    }
}

using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Scripting;

namespace WebXR
{
    public class WebXRCamera : MonoBehaviour
    {
        [SerializeField] private Camera cameraMain, cameraL, cameraR;
        private bool xrActive;
        private bool hasHeadsetPose;
        private Matrix4x4 pendingLeftView;
        private Matrix4x4 pendingRightView;
        private Matrix4x4 pendingLeftProjection;
        private Matrix4x4 pendingRightProjection;

        void OnEnable()
        {
            WebXRManager.Instance.OnXRChange += onVRChange;
            WebXRManager.Instance.OnHeadsetUpdate += onHeadsetUpdate;
            // URP does NOT invoke Camera.onPreRender — use the SRP callback instead.
            RenderPipelineManager.beginCameraRendering += onBeginCameraRendering;

            cameraMain.transform.localPosition = new Vector3(0, WebXRManager.Instance.DefaultHeight, 0);
        }

        private void OnDisable()
        {
            RenderPipelineManager.beginCameraRendering -= onBeginCameraRendering;

            if (WebXRManager.Instance == null) return;
            WebXRManager.Instance.OnXRChange -= onVRChange;
            WebXRManager.Instance.OnHeadsetUpdate -= onHeadsetUpdate;
        }

        private void onVRChange(WebXRState state)
        {
            xrActive = state == WebXRState.ENABLED;

            if (xrActive)
            {
                cameraMain.enabled = false;
                cameraL.enabled = true;
                cameraR.enabled = true;
                Debug.Log("WebXRCamera: XR ENABLED — CameraL/R on, CameraMain off");
            }
            else
            {
                cameraMain.enabled = true;
                cameraL.enabled = false;
                cameraR.enabled = false;
                ResetCameraMatrices(cameraMain);
                ResetCameraMatrices(cameraL);
                ResetCameraMatrices(cameraR);
                hasHeadsetPose = false;
                Debug.Log("WebXRCamera: XR NORMAL — CameraMain on");
            }
        }

        private void onHeadsetUpdate(
            Matrix4x4 leftProjectionMatrix,
            Matrix4x4 rightProjectionMatrix,
            Matrix4x4 leftViewMatrix,
            Matrix4x4 rightViewMatrix,
            Matrix4x4 sitStandMatrix)
        {
            Matrix4x4 invSitStand = sitStandMatrix.inverse;
            pendingLeftView = leftViewMatrix * invSitStand;
            pendingRightView = rightViewMatrix * invSitStand;
            pendingLeftProjection = leftProjectionMatrix;
            pendingRightProjection = rightProjectionMatrix;
            hasHeadsetPose = true;

            // Also drive transforms so culling / AudioListener follow the head even if a
            // pipeline path ignores explicit camera matrices.
            if (xrActive)
            {
                WebXRMatrixUtil.SetTransformFromViewMatrix(cameraL.transform, pendingLeftView);
                WebXRMatrixUtil.SetTransformFromViewMatrix(cameraR.transform, pendingRightView);
            }
            else
            {
                WebXRMatrixUtil.SetTransformFromViewMatrix(cameraMain.transform, pendingLeftView);
            }
        }

        private void onBeginCameraRendering(ScriptableRenderContext context, Camera cam)
        {
            if (!hasHeadsetPose || cam == null || !cam.enabled) return;

            if (xrActive)
            {
                if (cam == cameraL)
                    ApplyEye(cam, pendingLeftView, pendingLeftProjection);
                else if (cam == cameraR)
                    ApplyEye(cam, pendingRightView, pendingRightProjection);
            }
            else if (cam == cameraMain)
            {
                ApplyEye(cam, pendingLeftView, pendingLeftProjection);
            }
        }

        private static void ApplyEye(Camera cam, Matrix4x4 worldToCamera, Matrix4x4 projection)
        {
            cam.worldToCameraMatrix = worldToCamera;
            cam.projectionMatrix = projection;
        }

        private static void ResetCameraMatrices(Camera cam)
        {
            if (cam == null) return;
            cam.ResetWorldToCameraMatrix();
            cam.ResetProjectionMatrix();
        }
    }
}

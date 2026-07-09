using UnityEngine;
using WebXR;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

public class DesertFreeFlightController : MonoBehaviour {
    [Tooltip("Enable/disable rotation control. For use in Unity editor only.")]
    public bool rotationEnabled = true;

    [Tooltip("Enable/disable translation control. For use in Unity editor only.")]
    public bool translationEnabled = true;

    private WebXRDisplayCapabilities capabilities;

    [Tooltip("Mouse sensitivity")]
    public float mouseSensitivity = 1f;

    [Tooltip("Straffe Speed")]
    public float straffeSpeed = 5f;

    private float minimumX = -360f;
    private float maximumX = 360f;

    private float minimumY = -90f;
    private float maximumY = 90f;

    private float rotationX = 0f;
    private float rotationY = 0f;

    Quaternion originalRotation;

    void Start()
    {
        WebXRManager.Instance.OnXRChange += onXRChange;
        WebXRManager.Instance.OnXRCapabilitiesUpdate += onXRCapabilitiesUpdate;
        originalRotation = transform.localRotation;
    }

    private void onXRChange(WebXRState state)
    {
        if (state == WebXRState.ENABLED)
        {
            DisableEverything();
        }
        else
        {
            EnableAccordingToPlatform();
        }
    }

    private void onXRCapabilitiesUpdate(WebXRDisplayCapabilities vrCapabilities)
    {
        capabilities = vrCapabilities;
        EnableAccordingToPlatform();
    }

    void Update() {
        if (translationEnabled)
        {
            GetMoveAxes(out float moveX, out float moveZ);
            transform.Translate(moveX * Time.deltaTime * straffeSpeed, 0, moveZ * Time.deltaTime * straffeSpeed);
        }

        GetLookDelta(out bool lookHeld, out float lookX, out float lookY);

        if (rotationEnabled && lookHeld)
        {
            rotationX += lookX * mouseSensitivity;
            rotationY += lookY * mouseSensitivity;

            rotationX = ClampAngle (rotationX, minimumX, maximumX);
            rotationY = ClampAngle (rotationY, minimumY, maximumY);

            Quaternion xQuaternion = Quaternion.AngleAxis (rotationX, Vector3.up);
            Quaternion yQuaternion = Quaternion.AngleAxis (rotationY, Vector3.left);

            transform.localRotation = originalRotation * xQuaternion * yQuaternion;
        }
    }

    // Editor/desktop-only fly camera controls. Supports both Input System
    // configurations (activeInputHandler) so it doesn't throw when the legacy
    // Input Manager is disabled in Player Settings.
    void GetMoveAxes(out float x, out float z)
    {
        x = 0f;
        z = 0f;
#if ENABLE_INPUT_SYSTEM
        var keyboard = Keyboard.current;
        if (keyboard == null) return;
        if (keyboard.aKey.isPressed || keyboard.leftArrowKey.isPressed) x -= 1f;
        if (keyboard.dKey.isPressed || keyboard.rightArrowKey.isPressed) x += 1f;
        if (keyboard.sKey.isPressed || keyboard.downArrowKey.isPressed) z -= 1f;
        if (keyboard.wKey.isPressed || keyboard.upArrowKey.isPressed) z += 1f;
#else
        x = Input.GetAxis("Horizontal");
        z = Input.GetAxis("Vertical");
#endif
    }

    void GetLookDelta(out bool held, out float x, out float y)
    {
        held = false;
        x = 0f;
        y = 0f;
#if ENABLE_INPUT_SYSTEM
        var mouse = Mouse.current;
        if (mouse == null) return;
        held = mouse.leftButton.isPressed;
        if (!held) return;
        Vector2 delta = mouse.delta.ReadValue();
        // Roughly matches the old Input Manager "Mouse X"/"Mouse Y" scale.
        x = delta.x * 0.1f;
        y = delta.y * 0.1f;
#else
        held = Input.GetMouseButton(0);
        if (!held) return;
        x = Input.GetAxis("Mouse X");
        y = Input.GetAxis("Mouse Y");
#endif
    }

    void DisableEverything()
    {
        translationEnabled = false;
        rotationEnabled = false;
    }

    /// Enables rotation and translation control for desktop environments.
    /// For mobile environments, it enables rotation or translation according to
    /// the device capabilities.
    void EnableAccordingToPlatform()
    {
        rotationEnabled = translationEnabled = !capabilities.supportsImmersiveVR;
    }

    public static float ClampAngle (float angle, float min, float max)
    {
        if (angle < -360f)
            angle += 360f;
        if (angle > 360f)
            angle -= 360f;
        return Mathf.Clamp (angle, min, max);
    }
}

using UnityEngine;

namespace XRRooms.Bridge
{
    /// <summary>
    /// Keeps a TextMesh name tag facing the local player's camera (billboard).
    /// </summary>
    public class BillboardNameTag : MonoBehaviour
    {
        private TextMesh _textMesh;

        private void Awake()
        {
            _textMesh = GetComponent<TextMesh>();
        }

        private void LateUpdate()
        {
            if (Camera.main == null) return;
            transform.rotation = Camera.main.transform.rotation;
        }

        public void SetText(string text)
        {
            if (_textMesh == null)
                _textMesh = GetComponent<TextMesh>();
            if (_textMesh != null)
                _textMesh.text = text ?? string.Empty;
        }
    }
}

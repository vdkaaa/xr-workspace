using System.Collections.Generic;
using UnityEngine;

namespace XRRooms.Bridge
{
    /// <summary>
    /// Spawns/updates/destroys a GameObject per remote peer, driven by the
    /// BridgeManager peer events (PEER_JOIN / PEER_UPDATE / PEER_LEFT).
    /// </summary>
    public class PeerAvatarManager : MonoBehaviour
    {
        [SerializeField] private BridgeManager bridgeManager;

        // Optional: if null, a primitive capsule is used as a runtime placeholder.
        [SerializeField] private GameObject avatarPrefab;

        private readonly Dictionary<string, GameObject> _avatars =
            new Dictionary<string, GameObject>();

        private void OnEnable()
        {
            if (bridgeManager == null)
            {
                Debug.LogWarning("[PeerAvatarManager] bridgeManager no asignado en el Inspector");
                return;
            }

            bridgeManager.OnPeerJoin += HandlePeerJoin;
            bridgeManager.OnPeerUpdate += HandlePeerUpdate;
            bridgeManager.OnPeerLeft += HandlePeerLeft;
        }

        private void OnDisable()
        {
            if (bridgeManager == null) return;

            bridgeManager.OnPeerJoin -= HandlePeerJoin;
            bridgeManager.OnPeerUpdate -= HandlePeerUpdate;
            bridgeManager.OnPeerLeft -= HandlePeerLeft;
        }

        private void HandlePeerJoin(PeerJoinData data)
        {
            var position = ToVector3(data.position);
            var rotation = ToQuaternion(data.rotation);

            // Duplicate JOIN (e.g. React replay on bridge register): treat as update.
            if (_avatars.TryGetValue(data.userId, out var existing))
            {
                if (existing != null)
                {
                    existing.transform.position = position;
                    existing.transform.rotation = rotation;
                }
                Debug.Log(
                    $"[PeerAvatarManager] PEER_JOIN duplicado userId={data.userId}, tratado como update"
                );
                return;
            }

            GameObject avatar = avatarPrefab != null
                ? Instantiate(avatarPrefab, position, rotation)
                : CreateFallbackAvatar(position, rotation);

            var label = string.IsNullOrEmpty(data.displayName)
                ? data.userId
                : data.displayName;
            avatar.name = $"Avatar_{label}";

            // Name tag above the avatar (follows parent; billboards via BillboardNameTag).
            // TODO: si el nombre pudiera cambiar en caliente, habría que buscar el TextMesh hijo y actualizar su .text.
            var nameTagGo = new GameObject("NameTag");
            nameTagGo.transform.SetParent(avatar.transform, false);
            nameTagGo.transform.localPosition = new Vector3(0f, 1.2f, 0f);

            var textMesh = nameTagGo.AddComponent<TextMesh>();
            textMesh.text = label;
            textMesh.anchor = TextAnchor.MiddleCenter;
            textMesh.alignment = TextAlignment.Center;
            textMesh.fontSize = 48;
            textMesh.characterSize = 0.1f;
            textMesh.color = Color.white;

            nameTagGo.AddComponent<BillboardNameTag>();

            _avatars[data.userId] = avatar;
            Debug.Log($"[PeerAvatarManager] PEER_JOIN userId={data.userId} ({label})");
        }

        private void HandlePeerUpdate(PeerUpdateData data)
        {
            Debug.Log($"[PeerAvatarManager] HandlePeerUpdate recibido userId={data.userId} pos=({data.position?.x},{data.position?.y},{data.position?.z})");
            if (!_avatars.TryGetValue(data.userId, out var avatar) || avatar == null)
            {
                Debug.LogWarning(
                    $"[PeerAvatarManager] PEER_UPDATE sin avatar previo userId={data.userId}"
                );
                return;
            }

            // TODO: interpolar/lerp para movimiento suave en vez de teletransportar.
            avatar.transform.position = ToVector3(data.position);
            avatar.transform.rotation = ToQuaternion(data.rotation);
        }

        private void HandlePeerLeft(PeerLeftData data)
        {
            if (_avatars.TryGetValue(data.userId, out var avatar))
            {
                if (avatar != null) Destroy(avatar);
                _avatars.Remove(data.userId);
                Debug.Log($"[PeerAvatarManager] PEER_LEFT userId={data.userId}");
            }
        }

        private static GameObject CreateFallbackAvatar(Vector3 position, Quaternion rotation)
        {
            var capsule = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            capsule.transform.localScale = Vector3.one;
            capsule.transform.position = position;
            capsule.transform.rotation = rotation;
            return capsule;
        }

        private static Vector3 ToVector3(Vec3Data v)
        {
            return v == null ? Vector3.zero : new Vector3(v.x, v.y, v.z);
        }

        private static Quaternion ToQuaternion(QuatData q)
        {
            return q == null ? Quaternion.identity : new Quaternion(q.x, q.y, q.z, q.w);
        }
    }
}

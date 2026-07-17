using System;
using System.Runtime.InteropServices;
using UnityEngine;
using UnityEngine.Scripting;

namespace XRRooms.Bridge
{
    public class BridgeManager : MonoBehaviour
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void DispatchUnityEvent(string eventName, string json);
#endif

        private SessionData _session;

        /// <summary>True after a successful INIT stored a session.</summary>
        public bool IsAuthenticated => _session != null;

        /// <summary>Fired after INIT validates jwt/roomId/userId and stores _session.</summary>
        public event Action<SessionData> OnSessionReceived;

        /// <summary>Peer transform events (React → Unity), fire-and-forget (no OK/ERROR).</summary>
        public event Action<PeerJoinData> OnPeerJoin;
        public event Action<PeerUpdateData> OnPeerUpdate;
        public event Action<PeerLeftData> OnPeerLeft;

        private void Start()
        {
            Dispatch(new ReadyMessage());
        }

        [Preserve]
        public void OnReactMessage(string json)
        {
            if (string.IsNullOrEmpty(json))
            {
                Debug.LogWarning("[BridgeManager] OnReactMessage recibio JSON vacio");
                return;
            }

            TypeOnly peek;
            try
            {
                peek = JsonUtility.FromJson<TypeOnly>(json);
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[BridgeManager] JSON invalido: {e.Message}");
                return;
            }

            if (peek == null || string.IsNullOrEmpty(peek.type))
            {
                Debug.LogWarning("[BridgeManager] Mensaje sin type");
                return;
            }

            switch (peek.type)
            {
                case "INIT":
                    HandleInit(json);
                    break;
                case "CHANGE_ROOM":
                    HandleChangeRoom(json);
                    break;
                case "LOGOUT":
                    HandleLogout();
                    break;
                case "PEER_JOIN":
                    HandlePeerJoin(json);
                    break;
                case "PEER_UPDATE":
                    HandlePeerUpdate(json);
                    break;
                case "PEER_LEFT":
                    HandlePeerLeft(json);
                    break;
                default:
                    Debug.LogWarning($"[BridgeManager] Tipo desconocido: {peek.type}");
                    break;
            }
        }

        private void HandleInit(string json)
        {
            var msg = JsonUtility.FromJson<InitMessage>(json);
            var payload = msg?.payload;

            if (payload == null ||
                string.IsNullOrEmpty(payload.jwt) ||
                string.IsNullOrEmpty(payload.roomId) ||
                string.IsNullOrEmpty(payload.userId))
            {
                Debug.LogError("[BridgeManager] INIT incompleto (falta jwt, roomId o userId)");
                Dispatch(new ErrorMessage
                {
                    payload = new ErrorPayload
                    {
                        message = "INIT incompleto: se requieren jwt, roomId y userId"
                    }
                });
                return;
            }

            _session = new SessionData
            {
                Jwt = payload.jwt,
                RoomId = payload.roomId,
                UserId = payload.userId
            };

            Debug.Log(
                $"[BridgeManager] INIT ok userId={_session.UserId} roomId={_session.RoomId}"
            );
            OnSessionReceived?.Invoke(_session);

            // TODO: Reemplazar este OK automatico por la llamada real a
            // POST /api/rooms/:id/join con el jwt. El OK/ERROR hacia React
            // debe depender de la respuesta del backend, no enviarse aca a ciegas.
            Dispatch(new OkMessage());
        }

        private void HandleChangeRoom(string json)
        {
            if (_session == null)
            {
                Debug.LogError("[BridgeManager] CHANGE_ROOM antes de INIT");
                Dispatch(new ErrorMessage
                {
                    payload = new ErrorPayload { message = "CHANGE_ROOM antes de INIT" }
                });
                return;
            }

            var msg = JsonUtility.FromJson<ChangeRoomMessage>(json);
            var roomId = msg?.payload?.roomId;
            if (string.IsNullOrEmpty(roomId))
            {
                Debug.LogError("[BridgeManager] CHANGE_ROOM sin roomId");
                Dispatch(new ErrorMessage
                {
                    payload = new ErrorPayload { message = "CHANGE_ROOM sin roomId" }
                });
                return;
            }

            _session.RoomId = roomId;
            Debug.Log($"[BridgeManager] CHANGE_ROOM -> {roomId}");

            // TODO: Reemplazar este OK automatico por repetir el join contra la
            // sala nueva (POST /api/rooms/:id/join con el jwt). OK/ERROR real
            // segun respuesta del backend.
            Dispatch(new OkMessage());
        }

        private void HandleLogout()
        {
            Debug.Log("[BridgeManager] LOGOUT — sesion limpiada");
            _session = null;
        }

        private void HandlePeerJoin(string json)
        {
            var msg = JsonUtility.FromJson<PeerJoinMessage>(json);
            var data = msg?.data;
            if (data == null || string.IsNullOrEmpty(data.userId))
            {
                Debug.LogWarning("[BridgeManager] PEER_JOIN sin userId");
                return;
            }

            OnPeerJoin?.Invoke(data);
        }

        private void HandlePeerUpdate(string json)
        {
            var msg = JsonUtility.FromJson<PeerUpdateMessage>(json);
            var data = msg?.data;
            if (data == null || string.IsNullOrEmpty(data.userId))
            {
                Debug.LogWarning("[BridgeManager] PEER_UPDATE sin userId");
                return;
            }

            OnPeerUpdate?.Invoke(data);
        }

        private void HandlePeerLeft(string json)
        {
            var msg = JsonUtility.FromJson<PeerLeftMessage>(json);
            var data = msg?.data;
            if (data == null || string.IsNullOrEmpty(data.userId))
            {
                Debug.LogWarning("[BridgeManager] PEER_LEFT sin userId");
                return;
            }

            OnPeerLeft?.Invoke(data);
        }

        public void SendLocalTransform(Vector3 position, Quaternion rotation)
        {
            Dispatch(new LocalTransformMessage
            {
                data = new LocalTransformData
                {
                    position = new Vec3Data
                    {
                        x = position.x,
                        y = position.y,
                        z = position.z
                    },
                    rotation = new QuatData
                    {
                        x = rotation.x,
                        y = rotation.y,
                        z = rotation.z,
                        w = rotation.w
                    }
                }
            });
        }

        private void Dispatch<T>(T message)
        {
            var json = JsonUtility.ToJson(message);
#if UNITY_WEBGL && !UNITY_EDITOR
            DispatchUnityEvent("UnityMessage", json);
#else
            Debug.Log($"[BridgeManager] (editor mock) UnityMessage {json}");
#endif
        }
    }
}

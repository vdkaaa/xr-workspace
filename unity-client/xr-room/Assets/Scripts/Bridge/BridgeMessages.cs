using System;
using UnityEngine.Scripting;

namespace XRRooms.Bridge
{
    [Serializable]
    public class TypeOnly
    {
        public string type;
    }

    [Preserve]
    [Serializable]
    public class InitPayload
    {
        public string jwt;
        public string roomId;
        public string userId;
    }

    [Preserve]
    [Serializable]
    public class InitMessage
    {
        public string type;
        public InitPayload payload;
    }

    [Preserve]
    [Serializable]
    public class ChangeRoomPayload
    {
        public string roomId;
    }

    [Preserve]
    [Serializable]
    public class ChangeRoomMessage
    {
        public string type;
        public ChangeRoomPayload payload;
    }

    [Serializable]
    public class ReadyMessage
    {
        public string type = "READY";
    }

    [Serializable]
    public class OkMessage
    {
        public string type = "OK";
    }

    [Preserve]
    [Serializable]
    public class ErrorPayload
    {
        public string message;
    }

    [Preserve]
    [Serializable]
    public class ErrorMessage
    {
        public string type = "ERROR";
        public ErrorPayload payload;
    }

    /// <summary>In-memory session after a successful INIT (not for JsonUtility).</summary>
    public class SessionData
    {
        public string Jwt;
        public string RoomId;
        public string UserId;
    }

    // ── Peer transform protocol (React → Unity) ──────────────────────────────
    // These use the "data" key (not "payload") to match the React side; they are
    // a separate protocol namespace over the same channel, keyed by "type".

    [Preserve]
    [Serializable]
    public class Vec3Data
    {
        public float x;
        public float y;
        public float z;
    }

    [Preserve]
    [Serializable]
    public class QuatData
    {
        public float x;
        public float y;
        public float z;
        public float w;
    }

    [Preserve]
    [Serializable]
    public class PeerJoinData
    {
        public string userId;
        public string displayName;
        public Vec3Data position;
        public QuatData rotation;
    }

    [Preserve]
    [Serializable]
    public class PeerJoinMessage
    {
        public string type;
        public PeerJoinData data;
    }

    [Preserve]
    [Serializable]
    public class PeerUpdateData
    {
        public string userId;
        public Vec3Data position;
        public QuatData rotation;
    }

    [Preserve]
    [Serializable]
    public class PeerUpdateMessage
    {
        public string type;
        public PeerUpdateData data;
    }

    [Preserve]
    [Serializable]
    public class PeerLeftData
    {
        public string userId;
    }

    [Preserve]
    [Serializable]
    public class PeerLeftMessage
    {
        public string type;
        public PeerLeftData data;
    }

    // ── Local transform protocol (Unity → React) ─────────────────────────────
    // Built in C# and serialized out; no [Preserve] needed (not deserialized).

    [Serializable]
    public class LocalTransformData
    {
        public Vec3Data position;
        public QuatData rotation;
    }

    [Serializable]
    public class LocalTransformMessage
    {
        public string type = "LOCAL_TRANSFORM";
        public LocalTransformData data;
    }
}

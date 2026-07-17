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
}

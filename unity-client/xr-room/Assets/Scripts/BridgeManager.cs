using UnityEngine;
using System.Runtime.InteropServices;
public class BridgeManager : MonoBehaviour
{
    [Header("Datos recibidos desde React")]
    [SerializeField] private string jwt;
    [SerializeField] private string roomId;
    [SerializeField] private string userId;

    public string Jwt => jwt;
    public string RoomId => roomId;
    public string UserId => userId;

#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")]
    private static extern void SendMessageToReact(string message);
#endif
    private void Start()
    {
        SendToReact("  { type: \"INIT\", payload: { jwt: string, roomId: string, userId: string } }");
    }
    // REACT TO UNITY
    public void ReceiveJWT(string value)
    {
        jwt = value;
        Debug.Log($"JWT recibido: {jwt}");
    }

    public void ReceiveRoomId(string value)
    {
        roomId = value;
        Debug.Log($"Room ID recibido: {roomId}");
    }

    public void ReceiveUserId(string value)
    {
        userId = value;
        Debug.Log($"User ID recibido: {userId}");
    }

    // UNITY TO REACT
    public void SendToReact(string message)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
    SendMessageToReact(message);
#else
        Debug.Log($"[BridgeManager] -> React> {message}");
#endif
    }
}

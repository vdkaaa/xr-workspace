namespace WebXR
{
	// Mirrors the JSON payload sent from the browser bridge (web-client) via
	// sendMessage(gameObjectName, "OnWebXRHeadsetData", json) on every XR frame.
	// Replaces the old float[]-over-shared-memory approach (see WebXRManager.cs
	// history), which depended on raw Emscripten heap internals that are not
	// stable across Unity/Emscripten versions.
	[System.Serializable]
	class WebXRHeadsetData
	{
		public float[] leftProjectionMatrix = null;
		public float[] rightProjectionMatrix = null;
		public float[] leftViewMatrix = null;
		public float[] rightViewMatrix = null;
		public float[] sitStandMatrix = null;

		public static WebXRHeadsetData CreateFromJSON(string jsonString)
		{
			return UnityEngine.JsonUtility.FromJson<WebXRHeadsetData>(jsonString);
		}
	}
}

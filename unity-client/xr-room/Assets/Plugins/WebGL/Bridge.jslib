mergeInto(LibraryManager.library,{

    SendMessageToReact: function (messagePtr)
    {
        console.log("===== Bridge.jslib =====");

        const message = UTF8ToString(messagePtr);
        console.log("[Unity] -> React", message);

        window.dispatchEvent(
            new CustomEvent("UnityMessage",
            {
                detail: message
            })
        );
        
        console.log("========================");
    }
});
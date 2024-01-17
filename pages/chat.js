let chatBody;
let chromeTabId;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "chat:user-joined") {
        addServerMessage(`~ ${request.username} joined the room`);
    }

    if (request.action === "chat:user-left") {
        addServerMessage(`~ ${request.username} left the room`);
    }

    if (request.action === "chat:add-message") {
        addMessage(request.username, request.message);
    }

    if (request.action === "chat:destroy") {
        destroyChat();
    }
});

const addElToChatBody = (el) => {
    chatBody.appendChild(el);
};

const addServerMessage = (message) => {
    const p = document.createElement("p");
    p.classList.add("server-message");
    p.innerText = message;

    addElToChatBody(p);
};

const addMessage = (user, message) => {
    const p = document.createElement("p");
    p.classList.add("message");

    const usernameSpan = document.createElement("span");
    usernameSpan.classList.add("username");
    usernameSpan.innerText = user + ":";

    const messageSpan = document.createElement("span");
    messageSpan.classList.add("message");
    messageSpan.innerText = message;

    p.appendChild(usernameSpan);
    p.appendChild(messageSpan);

    addElToChatBody(p);

    // if necessary scroll down the chat body
    chatBody.scrollTop = chatBody.scrollHeight;
};

document.addEventListener("DOMContentLoaded", () => {
    chatBody = document.getElementById("chat-messages");
});

const destroyChat = () => {
    console.log("destroying chat");

    window.parent.postMessage(
        {
            action: "destroy-iframe",
        },
        "*"
    );
};

const getCurrentRoom = async () => {
    return chrome.runtime.sendMessage({
        action: "get-room",
    });
};

const isDisconnected = async () => {
    try {
        const room = await getCurrentRoom();

        return !room;
    } catch (e) {
        return true;
    }
};

let settingsModal;
let settingsSaveBtn;
let settingsUsername;
let settingsModalError;

const loadSettings = async () => {
    const user = await chrome.runtime.sendMessage({
        action: "get-user",
    });

    settingsUsername.value = user.username;
};

const displaySettingsError = (message) => {
    settingsModalError.textContent = message;
    settingsModalError.style.display = "block";
};

const saveSettings = async () => {
    const username = settingsUsername.value.trim();

    if (username.length < 1) {
        displaySettingsError("Username cannot be empty");

        return;
    }

    await chrome.runtime.sendMessage({
        action: "set-username",
        username,
    });

    settingsModalError.style.display = "none";
};

document.addEventListener("DOMContentLoaded", async () => {
    const messageInput = document.getElementById("messageInput");
    const sendBtn = document.getElementById("sendBtn");
    const closeBtn = document.getElementById("closeBtn");
    const roomName = document.getElementById("room-name");

    const settingsBtn = document.getElementById("settingsBtn");
    const settingsModal = document.getElementById("settings-modal");
    const settingsCloseBtn = document.getElementById("settings-modal-close");
    settingsSaveBtn = document.getElementById("settings-modal-save");
    settingsUsername = document.getElementById("settings-username");
    settingsModalError = document.getElementById("settings-modal-error");

    settingsBtn.addEventListener("click", async () => {
        await loadSettings();

        settingsModal.style.display = "block";
    });

    settingsCloseBtn.addEventListener("click", () => {
        settingsModal.style.display = "none";
    });

    settingsSaveBtn.addEventListener("click", async () => {
        await saveSettings();
    });

    // Send message on button click
    sendBtn.addEventListener("click", () => {
        const message = messageInput.value.trim();

        if (message) {
            chrome.runtime.sendMessage({
                action: "send-chat-message",
                message,
            });

            addMessage("You", message);
            messageInput.value = "";
        }
    });

    messageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            const message = messageInput.value.trim();
            if (message) {
                chrome.runtime.sendMessage({
                    action: "send-chat-message",
                    message,
                });

                addMessage("You", message);
                messageInput.value = "";
            }
        }
    });

    closeBtn.addEventListener("click", () => {
        destroyChat();
    });

    const currentRoom = await getCurrentRoom();

    if (currentRoom) {
        roomName.textContent = currentRoom.id;
    }

    setInterval(async () => {
        const isDisc = await isDisconnected();

        if (isDisc) {
            destroyChat();
        }
    }, 2000);
});

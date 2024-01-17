let chatBody;
let chromeTabId;
let user;
let room;

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === "chat:user-joined") {
        addServerMessage(`~ ${request.username} joined the room`);

        await refreshRoom();
    }

    if (request.action === "chat:user-left") {
        addServerMessage(`~ ${request.username} left the room`);

        await refreshRoom();
    }

    if (request.action === "chat:add-message") {
        addMessage(request.username, request.message);
    }

    if (request.action === "chat:destroy") {
        destroyChat();
    }

    if (request.action === "chat:user-updated") {
        if (request.oldUser.username === request.newUser.username) {
            return;
        }

        addServerMessage(
            `~ ${request.oldUser.username} changed their username to ${request.newUser.username}`
        );

        await refreshRoom();
    }

    if (request.action === "chat:party-updated") {
        await refreshRoom();
    }
});

const refreshRoom = async () => {
    room = await getCurrentRoom();

    if (room) {
        roomName.textContent = room.id;
    }
};

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
let settingsRoomName;
let roomName;
let dataHostOnlys;

const loadSettings = () => {
    settingsModalError.style.display = "none";
    settingsUsername.value = user.username;

    if (room.isHost) {
        settingsRoomName.value = room.id;

        dataHostOnlys.forEach((el) => {
            el.style.display = "block";
        });
    } else {
        dataHostOnlys.forEach((el) => {
            el.style.display = "none";
        });
    }
};

const displaySettingsError = (message) => {
    settingsModalError.textContent = message;
    settingsModalError.style.display = "block";
};

const saveSettings = async () => {
    const username = settingsUsername.value.trim();
    const roomId = settingsRoomName.value.trim();

    if (username.length < 1) {
        displaySettingsError("Username cannot be empty");

        return false;
    }

    if (room.isHost && roomId.length < 1) {
        displaySettingsError("Room ID cannot be empty");

        return false;
    }

    await chrome.runtime.sendMessage({
        action: "set-username",
        username,
    });

    if (room.isHost) {
        await chrome.runtime.sendMessage({
            action: "set-room-id",
            roomId,
        });
    }

    user.username = username;
    await refreshRoom();

    settingsModalError.style.display = "none";

    return true;
};

document.addEventListener("DOMContentLoaded", async () => {
    const messageInput = document.getElementById("messageInput");
    const sendBtn = document.getElementById("sendBtn");
    const closeBtn = document.getElementById("closeBtn");
    roomName = document.getElementById("room-name");

    const settingsBtn = document.getElementById("settingsBtn");
    const settingsModal = document.getElementById("settings-modal");
    const settingsCloseBtn = document.getElementById("settings-modal-close");
    settingsSaveBtn = document.getElementById("settings-modal-save");
    settingsUsername = document.getElementById("settings-username");
    settingsModalError = document.getElementById("settings-modal-error");
    settingsRoomName = document.getElementById("settings-room-name");
    dataHostOnlys = document.querySelectorAll("[data-host-only]");

    settingsBtn.addEventListener("click", async () => {
        loadSettings();

        settingsModal.style.display = "block";
    });

    settingsCloseBtn.addEventListener("click", () => {
        settingsModal.style.display = "none";
    });

    settingsSaveBtn.addEventListener("click", async () => {
        settingsSaveBtn.disabled = true;
        settingsSaveBtn.textContent = "Saving...";

        const success = await saveSettings();

        if (success) {
            settingsSaveBtn.classList.add("success");
            settingsSaveBtn.textContent = "Saved!";

            setTimeout(() => {
                settingsSaveBtn.classList.remove("success");
                settingsSaveBtn.disabled = false;
                settingsSaveBtn.textContent = "Save";
            }, 1500);

            return;
        }

        settingsSaveBtn.classList.add("error");
        settingsSaveBtn.textContent = "Failed";

        setTimeout(() => {
            settingsSaveBtn.classList.remove("error");
            settingsSaveBtn.disabled = false;
            settingsSaveBtn.textContent = "Save";
        }, 1500);
    });

    roomName.addEventListener("click", (event) => {
        if (!navigator.clipboard) {
            return;
        }

        navigator.clipboard.writeText(roomName.textContent);
    });

    // Send message on button click
    sendBtn.addEventListener("click", () => {
        const message = messageInput.value.trim();

        if (message) {
            chrome.runtime.sendMessage({
                action: "send-chat-message",
                message,
            });

            addMessage(user.username + " (You)", message);
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

                addMessage(user.username + " (You)", message);
                messageInput.value = "";
            }
        }
    });

    closeBtn.addEventListener("click", () => {
        destroyChat();
    });

    user = await chrome.runtime.sendMessage({
        action: "get-user",
    });

    await refreshRoom();

    addServerMessage(
        "Welcome to the chat! Currently " +
            room.users.length +
            " users connected"
    );

    setInterval(async () => {
        const isDisc = await isDisconnected();

        if (isDisc) {
            destroyChat();
        }
    }, 2000);
});

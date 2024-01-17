import "./socket.io.min.js";

let socket;
let currentRoom;
let myData;

const getResp = (event, data) => {
    return new Promise((resolve) => {
        socket.emit(event, data, (resp) => {
            resolve(resp);
        });
    });
};

const createBadge = () => {
    const text = currentRoom?.users?.length ?? "ON";

    chrome.action.setBadgeText({ text: text.toString() });
    chrome.action.setBadgeBackgroundColor({ color: "#4688F1" });
};

const destroyBadge = () => {
    chrome.action.setBadgeText({ text: "" });
};

if (!socket || !socket.connected) {
    socket = io.connect("https://digisync.simpt.io", {
        transports: ["websocket"],
    });

    socket.on("connect", () => {
        console.log("Connected to socket server");

        chrome.runtime.sendMessage({
            action: "popup:reset",
        });
    });

    socket.on("connect_error", (err) => {
        console.log("Failed to connect to socket server");

        currentRoom = null;

        destroyBadge();

        chrome.runtime.sendMessage({
            action: "popup:reset",
        });

        chrome.runtime.sendMessage({
            action: "chat:destroy",
        });
    });

    socket.on("user-joined", (user) => {
        currentRoom.users.push(user);

        chrome.runtime.sendMessage({
            action: "rerender-user-count",
            room: currentRoom,
        });

        chrome.runtime.sendMessage({
            action: "chat:user-joined",
            username: user.username,
        });

        createBadge();
    });

    socket.on("user-left", (user) => {
        currentRoom.users =
            currentRoom?.users.filter((u) => u.id !== user.id) ?? [];

        chrome.runtime.sendMessage({
            action: "rerender-user-count",
            room: currentRoom,
        });

        chrome.runtime.sendMessage({
            action: "chat:user-left",
            username: user.username,
        });

        createBadge();
    });

    socket.on("party-closed", () => {
        currentRoom = null;

        chrome.runtime.sendMessage({
            action: "rerender-party-closed",
        });

        chrome.runtime.sendMessage({
            action: "chat:destroy",
        });

        destroyBadge();
    });

    socket.on("chat-message", (data) => {
        chrome.runtime.sendMessage({
            action: "chat:add-message",
            username: data.user.username,
            message: data.message,
        });
    });

    socket.on("user-updated", (user) => {
        const oldUser = currentRoom.users.find((u) => u.id === user.id);

        currentRoom.users = currentRoom.users.map((u) => {
            if (u.id === user.id) {
                return user;
            }

            return u;
        });

        chrome.runtime.sendMessage({
            action: "chat:user-updated",
            oldUser,
            newUser: user,
        });
    });

    socket.on("party-updated", (party) => {
        currentRoom.id = party.id;

        chrome.runtime.sendMessage({
            action: "chat:party-updated",
            party,
        });

        chrome.runtime.sendMessage({
            action: "popup:reset",
        });
    });

    myData = {
        id: socket.id,
        username: Math.random().toString(36).substring(7),
    };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "send-chat-message") {
        socket.emit("br-chat-message", request.message);

        return;
    }

    if (request.action === "get-server-connection") {
        sendResponse(socket.connected);

        return true;
    }

    if (request.action === "party-exists") {
        getResp("party-exists", {
            partyId: request.id,
        }).then((resp) => {
            sendResponse(resp);
        });

        return true;
    }

    if (request.action === "get-room") {
        sendResponse(currentRoom ?? null);

        return true;
    }

    if (request.action === "get-user") {
        sendResponse(myData ?? null);

        return true;
    }

    if (request.action === "create-party") {
        socket.emit("create-party", {
            partyId: request.roomId,
            username: myData.username,
        });

        currentRoom = {
            id: request.roomId,
            isHost: true,
            users: [
                {
                    id: socket.id,
                    username: myData.username,
                },
            ],
        };

        createBadge();

        return;
    }

    if (request.action === "set-username") {
        myData.username = request.username;

        socket.emit("update-user", {
            username: request.username,
        });

        return;
    }

    if (request.action === "set-room-id") {
        currentRoom.id = request.roomId;

        socket.emit("update-party", {
            id: request.roomId,
        });

        return;
    }

    if (request.action === "join-party") {
        getResp("join-party", {
            partyId: request.partyId,
            username: myData.username,
        }).then((resp) => {
            currentRoom = {
                id: request.partyId,
                isHost: false,
                users: resp.users,
            };

            createBadge();

            sendResponse(currentRoom);
        });

        return true;
    }

    if (request.action === "leave-party") {
        socket.emit("leave-party");

        currentRoom = null;

        chrome.runtime.sendMessage({
            action: "chat:destroy",
        });

        destroyBadge();

        return;
    }

    if (request.action === "destroy-chat") {
        chrome.runtime.sendMessage({
            action: "chat:destroy",
        });
    }
});

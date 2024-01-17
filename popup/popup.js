// get service worker response
const getSWResp = (action, data) => {
    return chrome.runtime.sendMessage({
        action,
        ...data,
    });
};

const hideMany = (els) => {
    els.forEach((el) => {
        el.classList.add("hidden");
    });
};

const showMany = (els, textContent = null) => {
    els.forEach((el) => {
        if (textContent) el.textContent = textContent;

        el.classList.remove("hidden");
    });
};

const bindMany = (els, event, callback) => {
    els.forEach((el) => {
        el.addEventListener(event, callback);
    });
};

const clearMany = (els, event, callback) => {
    els.forEach((el) => {
        el.removeEventListener(event, callback);
    });
};

const getActiveTabId = () => {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];

            resolve(activeTab.id);
        });
    });
};

let myData;

// html elements
let homeSection;
let partySection;
let fatalErrorSection;

let joinButton;
let createBtn;
let partyIdInput;
let usersCountBadges;

let dataHosts;
let dataClients;
let dataRooms;
let dataQuits;
let dataErrors;
let dataUsernames;
let fatalErrorMsg;
let injectChatButton;

const hideSections = () => {
    homeSection.classList.add("hidden");
    partySection.classList.add("hidden");
    fatalErrorSection.classList.add("hidden");
};

const joinButtonHomeSectionClick = async (roomId) => {
    if (partyIdInput.value.length < 3) {
        renderHomeSection("Room ID must be at least 3 characters long", roomId);

        return;
    }

    const partyDoesExist = await chrome.runtime.sendMessage({
        action: "party-exists",
        id: partyIdInput.value,
    });

    if (!partyDoesExist) {
        renderHomeSection("Room does not exist", roomId);

        return;
    }

    const tabId = await getActiveTabId();

    const room = await chrome.runtime.sendMessage({
        action: "join-party",
        partyId: partyIdInput.value,
        tabId,
    });

    injectPageWithChat();

    renderPartySection(partyIdInput.value, false, room.users.length);
};

const createButtonHomeSectionClick = async () => {
    if (partyIdInput.value.length < 3) {
        renderHomeSection("Room ID must be at least 3 characters long");

        return;
    }

    const partyDoesExist = await chrome.runtime.sendMessage({
        action: "party-exists",
        id: partyIdInput.value,
    });

    if (partyDoesExist) {
        renderHomeSection("Room with name already exists");

        return;
    }

    const tabId = await getActiveTabId();

    await chrome.runtime.sendMessage({
        action: "create-party",
        roomId: partyIdInput.value,
        tabId,
    });

    injectPageWithChat();

    renderPartySection(partyIdInput.value, true, 1);
};

const dataQuitsClickPartySection = async () => {
    await chrome.runtime.sendMessage({
        action: "leave-party",
    });

    renderHomeSection();
};

const injectPageWithChat = () => {
    window.close();

    const extensionsId = chrome.runtime.id;

    // append the iframe to currently active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];

        chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: (id) => {
                const iframe = document.createElement("iframe");
                const chatUrl = `chrome-extension://${id}/pages/chat.html`;

                iframe.src = chatUrl;

                iframe.style.width = "400px";
                iframe.style.height = "100%";
                iframe.style.position = "fixed";
                iframe.style.bottom = "0";
                iframe.style.right = "0";
                iframe.style.border = "none";
                iframe.id = "chat-iframe";
                iframe.allow = "clipboard-write;";

                const checkExist = document.getElementById("chat-iframe");

                if (!checkExist) {
                    document.body.appendChild(iframe);

                    window.addEventListener("message", (event) => {
                        if (
                            event.data.action &&
                            event.data.action === "destroy-iframe"
                        ) {
                            const chatIframe =
                                document.getElementById("chat-iframe");

                            if (chatIframe) {
                                chatIframe.remove();
                            }
                        }
                    });
                }
            },
            args: [extensionsId],
        });

        chrome.runtime.sendMessage({
            action: "chat:set-tabid",
            tabId: activeTab.id,
        });
    });
};

let latestJoinButtonHomeSectionClickCallback = null;

const renderHomeSection = (errorMsg, roomId = "") => {
    hideSections();

    dataUsernames.forEach((el) => {
        el.innerText = myData.username;
    });

    if (latestJoinButtonHomeSectionClickCallback) {
        joinButton.removeEventListener(
            "click",
            latestJoinButtonHomeSectionClickCallback
        );
    }

    latestJoinButtonHomeSectionClickCallback = () =>
        joinButtonHomeSectionClick(roomId);

    joinButton.addEventListener(
        "click",
        latestJoinButtonHomeSectionClickCallback,
        {
            once: true,
        }
    );

    createBtn.addEventListener("click", createButtonHomeSectionClick, {
        once: true,
    });

    if (errorMsg) {
        showMany(dataErrors, errorMsg);
    } else {
        hideMany(dataErrors);
    }

    partyIdInput.value = roomId;

    homeSection.classList.remove("hidden");
};

const renderPartySection = async (roomId, isHost, connectedUsers = 0) => {
    hideSections();

    dataUsernames.forEach((el) => {
        el.innerText = myData.username;
    });

    usersCountBadges.forEach((el) => {
        el.innerText = connectedUsers;
    });

    dataRooms.forEach((el) => {
        el.innerText = roomId;
    });

    if (isHost) {
        showMany(dataHosts);
        hideMany(dataClients);
    } else {
        hideMany(dataHosts);
        showMany(dataClients);
    }

    clearMany(dataQuits, "click", dataQuitsClickPartySection);
    bindMany(dataQuits, "click", dataQuitsClickPartySection);

    injectChatButton.addEventListener(
        "click",
        () => {
            injectPageWithChat();
        },
        {
            once: true,
        }
    );

    partySection.classList.remove("hidden");
};

const renderFatalErrorSection = (errorMsg) => {
    hideSections();

    fatalErrorMsg.innerText = errorMsg;

    fatalErrorSection.classList.remove("hidden");
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "rerender-user-count") {
        usersCountBadges.forEach((el) => {
            el.innerText = request.room.users.length;
        });
    }

    if (request.action === "rerender-party-closed") {
        renderHomeSection("Party closed");
    }

    if (request.action === "popup:reset") {
        baseRender();
    }
});

const baseRender = async () => {
    const serverConnection = await chrome.runtime.sendMessage({
        action: "get-server-connection",
    });

    if (!serverConnection) {
        renderFatalErrorSection("Server connection failed");

        return;
    }

    myData = await chrome.runtime.sendMessage({
        action: "get-user",
    });

    const inRoom = await chrome.runtime.sendMessage({
        action: "get-room",
    });

    if (inRoom) {
        // user should do it manual
        // injectPageWithChat();

        return renderPartySection(
            inRoom.id,
            inRoom.isHost,
            inRoom.users.length
        );
    }

    renderHomeSection();
};

document.addEventListener("DOMContentLoaded", async () => {
    homeSection = document.querySelector("#home");
    partySection = document.querySelector("#party");
    joinButton = document.querySelector("#join-btn");
    createBtn = document.querySelector("#create-btn");
    partyIdInput = document.querySelector("#party-id");
    usersCountBadges = document.querySelectorAll("[data-user-count]");
    dataHosts = document.querySelectorAll("[data-host]");
    dataClients = document.querySelectorAll("[data-client]");
    dataQuits = document.querySelectorAll("[data-quit]");
    dataErrors = document.querySelectorAll("[data-error]");
    dataRooms = document.querySelectorAll("[data-room]");
    dataUsernames = document.querySelectorAll("[data-username]");
    fatalErrorSection = document.querySelector("#fatal-error");
    fatalErrorMsg = document.querySelector("#fatal-error-msg");
    injectChatButton = document.querySelector("#inject-chat");

    baseRender();
});

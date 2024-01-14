import "./socket.io.min.js";

let socket;
let connectedUsersCount = 0;

const resetStorage = () => {
    connectedUsersCount = 0;
};

const cleanUrl = (url) => {
    const urlUrl = new URL(url);

    return `${urlUrl.origin}${urlUrl.pathname}`;
};

if (!socket || !socket.connected) {
    socket = io.connect("https://digisync.simpt.io", {
        transports: ["websocket"],
    });

    socket.on("connect", () => {
        console.log(socket.id);
    });

    socket.on("host-url-redirect", async (url) => {
        const tabs = await chrome.tabs.query({});

        const fromUrl = socket.bookUrl ?? url;
        const toUrl = url;

        let isOpen = false;

        tabs.forEach((tab) => {
            if (tab.id === socket.tabId) {
                chrome.tabs.update(tab.id, { url: toUrl, active: true });

                socket.bookUrl = cleanUrl(toUrl);
                socket.bookUrlDirty = toUrl;

                isOpen = true;
            }
        });

        if (!isOpen) {
            const newTab = await chrome.tabs.create({ url: toUrl });

            socket.bookUrl = toUrl;
            socket.tabId = newTab.id;

            console.log(newTab);
        }
    });

    socket.on("host-page-content-change", async (content) => {
        const tabs = await chrome.tabs.query({});

        tabs.forEach((tab) => {
            if (tab.id !== socket.tabId) return;

            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: (content) => {
                    const sketch1 = document.querySelector("#sketch1");
                    if (sketch1) {
                        sketch1.innerHTML = content;
                    }
                },
                args: [content],
            });
        });
    });

    socket.on("host-page-update", async (page) => {
        const tabs = await chrome.tabs.query({});

        tabs.forEach((tab) => {
            if (cleanUrl(tab.url) === socket.bookUrl) {
                socket.tabId = tab.id;

                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (pageNr) => {
                        const pageInput = document.querySelector("#txtPage");
                        pageInput.value = pageNr; // sub for cover and toc
                        pageInput.dispatchEvent(new Event("change"));
                    },
                    args: [page],
                });
            }
        });
    });

    socket.on("user-joined", () => {
        console.log("User joined");

        connectedUsersCount++;

        chrome.runtime.sendMessage({
            action: "user-joined",
            forPopup: true,
            count: connectedUsersCount,
        });
    });

    socket.on("user-left", () => {
        console.log("User left");

        connectedUsersCount--;

        chrome.runtime.sendMessage({
            action: "user-left",
            forPopup: true,
            count: connectedUsersCount,
        });
    });

    socket.on("party-closed", () => {
        console.log("Party closed");

        socket.roomId = null;
        socket.host = null;

        resetStorage();

        chrome.runtime.sendMessage({
            action: "party-closed",
            forPopup: true,
        });
    });

    console.log("Connected");
}

let hostTriggers = [];

const addHostTriggers = async () => {
    if (!socket.connected) return;

    hostTriggers.push(
        setInterval(async () => {
            const tabs = await chrome.tabs.query({});

            tabs.forEach((tab) => {
                if (tab.id !== socket.tabId) return;
                console.log(tab.url, socket.bookUrlDirty);

                if (tab.url === socket.bookUrlDirty) return;

                socket.emit("host-url-change", tab.url);
                socket.bookUrl = cleanUrl(tab.url);
                socket.bookUrlDirty = tab.url;
            });
        }, 500)
    );

    hostTriggers.push(
        setInterval(async () => {
            const tabs = await chrome.tabs.query({});

            tabs.forEach((tab) => {
                if (tab.id !== socket.tabId) return;

                chrome.scripting.executeScript(
                    {
                        target: { tabId: tab.id },
                        function: () => {
                            const sketch1 = document.querySelector("#sketch1");
                            if (sketch1) {
                                let htmlContent = "";
                                for (
                                    let i = 0;
                                    i < sketch1.children.length;
                                    i++
                                ) {
                                    htmlContent +=
                                        sketch1.children[i].outerHTML;
                                }
                                return htmlContent;
                            }
                            return null;
                        },
                    },
                    (results) => {
                        if (results && results[0]) {
                            const content = results[0].result;

                            socket.emit("host-page-content-change", content);
                        }
                    }
                );
            });
        }, 500)
    );
};

const clearHostTriggers = () => {
    hostTriggers.forEach((trigger) => {
        clearInterval(trigger);
    });

    hostTriggers = [];
};

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === "socket-status") {
        sendResponse({
            connected: socket.connected,
        });
    }

    if (request.action === "create") {
        socket.emit("create-party", {
            roomId: request.roomId,
            url: request.url,
        });

        socket.roomId = request.roomId;
        socket.host = true;
        socket.bookUrl = cleanUrl(request.url);
        socket.bookUrlDirty = request.url;

        const tabs = await chrome.tabs.query({});

        tabs.forEach((tab) => {
            if (cleanUrl(tab.url) === socket.bookUrl) {
                socket.tabId = tab.id;

                return;
            }
        });

        resetStorage();

        addHostTriggers();

        return;
    }

    if (request.action === "join") {
        socket.emit("join-party", request.roomId);

        socket.roomId = request.roomId;
        socket.host = false;

        resetStorage();

        return;
    }

    if (request.action === "get-room") {
        if (!socket.roomId) return null;

        sendResponse({
            id: socket.roomId,
            isHost: socket.host,
            connectedUsersCount,
        });

        return;
    }

    if (request.action === "leave") {
        if (socket.host) {
            clearHostTriggers();
            socket.emit("close-party");
        } else {
            socket.emit("leave-party");
        }

        socket.roomId = null;
        socket.host = null;
        socket.bookUrl = null;
        socket.bookUrlDirty = null;
        socket.tabId = null;

        resetStorage();

        return;
    }
});

const MessagingHelper = {
    send(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    },

    addListener(callback) {
        chrome.runtime.onMessage.addListener(callback);
    }
};

window.MessagingHelper = MessagingHelper;

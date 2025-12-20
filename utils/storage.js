const StorageHelper = {
    get(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.get(keys, (data) => {
                resolve(data);
            });
        });
    },

    set(data) {
        return new Promise((resolve) => {
            chrome.storage.local.set(data, () => {
                resolve();
            });
        });
    },

    remove(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.remove(keys, () => {
                resolve();
            });
        });
    },

    addListener(callback) {
        chrome.storage.onChanged.addListener(callback);
    }
};

window.StorageHelper = StorageHelper;

const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lab', {
  action: (action, payload = {}) => ipcRenderer.invoke('lab:action', action, payload),
  subscribe: (callback) => {
    const listener = (event, state) => callback(state);
    ipcRenderer.on('lab:state', listener);
    return () => ipcRenderer.removeListener('lab:state', listener);
  },
});

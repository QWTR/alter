// The bridge between ALTTER's window and the desktop app: the custom title bar's buttons and the agents' cursor overlay.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alterDesktop', {
  platform: process.platform,
  minimize: () => ipcRenderer.send('win:minimize'),
  toggleMaximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  /** Someone else's shared chat ("<host>/#/s/<token>") in its own app window. */
  openSession: (url) => ipcRenderer.send('win:openSession', String(url)),
  onState: (cb) => {
    const h = (_e, s) => cb(s);
    ipcRenderer.on('win:state', h);
    return () => ipcRenderer.removeListener('win:state', h);
  },
});

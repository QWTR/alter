// Bridge for the agents' cursor overlay (a transparent, click-through window over each monitor).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alterOverlay', {
  on: (cb) => ipcRenderer.on('hands', (_e, msg) => cb(msg)),
  /** The HUD is clickable only while the mouse is over it; everywhere else clicks go to the apps below. */
  setInteractive: (on) => ipcRenderer.send('overlay:interactive', !!on),
  stop: () => ipcRenderer.send('overlay:stop'),
  /** Close the panel and the cursors until the agents are done (they keep working). */
  hide: () => ipcRenderer.send('overlay:hide'),
});

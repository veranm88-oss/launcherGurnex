const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel) => (cb) => {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('gurnex', {
  isDesktop: true,
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),

  info: () => ipcRenderer.invoke('gx:info'),
  installed: (root) => ipcRenderer.invoke('gx:installed', root),
  install: (root, version) => ipcRenderer.invoke('gx:install', { root, version }),
  launch: (opts) => ipcRenderer.invoke('gx:launch', opts),
  pickDir: (current) => ipcRenderer.invoke('gx:pickDir', current),
  open: (target) => ipcRenderer.invoke('gx:open', target),
  saveTrack: (file) => ipcRenderer.invoke('gx:saveTrack', webUtils.getPathForFile(file)),

  onProgress: on('gx:progress'),
  onGameExit: on('gx:game-exit'),
});

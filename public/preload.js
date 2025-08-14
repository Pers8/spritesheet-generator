const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld('electronAPI', {
  loadSession: () => ipcRenderer.invoke('load-session'),
  saveSession: tabs => ipcRenderer.invoke('save-session', tabs),
  resetApp:    () => ipcRenderer.invoke('reset-app'),
  openFolder:  () => ipcRenderer.invoke('open-folder'),
  exportGif:   (id,fr) => ipcRenderer.invoke('export-gif', id, fr),
  exportPng:   (id, framePaths) => ipcRenderer.invoke('export-png', id, framePaths),
  onExportProgress: cb => ipcRenderer.on('export-progress', cb),
  removeExportProgress: cb => ipcRenderer.removeListener('export-progress', cb),
  onResizeWarning: cb => ipcRenderer.on('resize-warning', cb),
  removeResizeWarning: cb => ipcRenderer.removeListener('resize-warning', cb),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  loadAppState: () => ipcRenderer.invoke('load-app-state'),
  saveAppState: (state) => ipcRenderer.invoke('save-app-state', state),
  listUserAssets: (creatorId, limit, cookie) => ipcRenderer.invoke('list-user-assets', creatorId, limit, cookie),
});


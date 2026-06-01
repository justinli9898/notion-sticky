const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notionSticky', {
  closeWindow: () => ipcRenderer.send('close-window'),
  openUrl: (url) => ipcRenderer.send('open-url', url),
  setOpacity: (opacity) => ipcRenderer.send('set-opacity', opacity),
  toggleCollapse: () => ipcRenderer.send('toggle-collapse'),
  startDrag: (x, y) => ipcRenderer.send('start-drag', x, y),
  dragMove: (x, y) => ipcRenderer.send('drag-move', x, y),
  zoom: (delta) => ipcRenderer.send('zoom', delta),
});

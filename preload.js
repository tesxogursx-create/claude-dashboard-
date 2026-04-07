const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onSessions:          (cb) => ipcRenderer.on('sessions', (_, data) => cb(data)),
  setIgnoreMouseEvents:(v)  => ipcRenderer.send('setIgnoreMouseEvents', v),
  setAlwaysOnTop:      (v)  => ipcRenderer.send('setAlwaysOnTop', v),
  close:               ()   => ipcRenderer.send('close'),
  minimize:            ()   => ipcRenderer.send('minimize'),
  setHeight:           (h)  => ipcRenderer.send('setHeight', h),
});

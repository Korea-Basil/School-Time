const { contextBridge, ipcRenderer } = require('electron');

function safeText(value, max = 80) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

contextBridge.exposeInMainWorld('schoolTime', Object.freeze({
  searchSchools: (query) => ipcRenderer.invoke('schooltime:search-schools', safeText(query)),
  getTimetable: (selection) => ipcRenderer.invoke('schooltime:get-timetable', {
    school: selection?.school,
    grade: Number.parseInt(selection?.grade, 10),
    classNo: Number.parseInt(selection?.classNo, 10)
  })
}));

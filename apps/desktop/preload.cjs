const { contextBridge } = require("electron")

contextBridge.exposeInMainWorld("mockDesktop", {
  isElectron: true,
  platform: process.platform,
  shell: "desktop",
})

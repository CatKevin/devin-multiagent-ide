import { contextBridge, ipcRenderer } from 'electron'
import type { WorkspaceApi } from './workspace-api'

const workspace: WorkspaceApi = {
  openRepository: () => ipcRenderer.invoke('workspace:open-repository'),
  createTask: (name) => ipcRenderer.invoke('workspace:create-task', name),
  inspectTask: (directory) => ipcRenderer.invoke('workspace:inspect-task', directory),
  previewFile: (directory, path) => ipcRenderer.invoke('workspace:preview-file', directory, path),
  revealTask: (directory) => ipcRenderer.invoke('workspace:reveal-task', directory),
}

contextBridge.exposeInMainWorld('workspace', workspace)

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, open, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { git, inspectWorktree, readRepository } from './git'
import type { Repository } from './workspace-api'

let repository: Repository | undefined

function createWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 840,
    minHeight: 560,
    backgroundColor: '#f7f9fc',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
    },
  })

  void window.loadFile(join(__dirname, '../src/index.html'))
}

function taskDirectory(directory: string) {
  if (!repository?.tasks.some((task) => task.directory === directory)) {
    throw new Error('Select a task from the open repository.')
  }
  return directory
}

ipcMain.handle('workspace:open-repository', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)!
  const result = await dialog.showOpenDialog(window, {
    title: 'Open a Git repository',
    properties: ['openDirectory'],
  })
  if (result.canceled) return null

  const root = await git(result.filePaths[0], 'rev-parse', '--show-toplevel')
  repository = await readRepository(root.replace(/\r?\n$/, ''))
  return repository
})

ipcMain.handle('workspace:create-task', async (_event, name: string) => {
  if (!repository) throw new Error('Open a Git repository first.')

  const slug = name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
  if (!slug) throw new Error('Use at least one letter or number in the task name.')

  const branch = `task/${slug}`
  const root = repository.directory
  const baseCommit = (await git(root, 'rev-parse', 'HEAD')).trim()
  const worktrees = join(app.getPath('userData'), 'worktrees')
  await mkdir(worktrees, { recursive: true })
  const directory = join(worktrees, `${slug}-${randomUUID().slice(0, 8)}`)

  await git(root, 'worktree', 'add', '-b', branch, directory, baseCommit)
  repository = await readRepository(root)
  const task = repository.tasks.find((entry) => entry.branch === branch)!
  return { repository, task }
})

ipcMain.handle('workspace:inspect-task', (_event, directory: string) => {
  return inspectWorktree(taskDirectory(directory))
})

ipcMain.handle('workspace:preview-file', async (_event, directory: string, path: string) => {
  const root = await realpath(taskDirectory(directory))
  const file = await realpath(resolve(root, path))
  const location = relative(root, file)
  if (!location || location === '..' || location.startsWith(`..${sep}`) || isAbsolute(location)) {
    throw new Error('The selected file is outside this worktree.')
  }

  const handle = await open(file)
  try {
    const buffer = Buffer.alloc(128 * 1024 + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    const truncated = bytesRead === buffer.length
    const preview = buffer.subarray(0, truncated ? bytesRead - 1 : bytesRead)
    if (preview.includes(0)) throw new Error('This file is binary and cannot be previewed as text.')
    return { text: preview.toString('utf8'), truncated }
  } finally {
    await handle.close()
  }
})

ipcMain.handle('workspace:reveal-task', async (_event, directory: string) => {
  const error = await shell.openPath(taskDirectory(directory))
  if (error) throw new Error(error)
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

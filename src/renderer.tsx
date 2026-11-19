import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { FilePreview, Repository, Task, WorkspaceApi, WorktreeSnapshot } from './workspace-api'
import './styles.css'

declare global {
  interface Window {
    workspace: WorkspaceApi
  }
}

function errorMessage(error: unknown) {
  return String(error).replace(/^Error: Error invoking remote method '[^']+': Error: /, '')
}

function App() {
  const [repository, setRepository] = useState<Repository>()
  const [task, setTask] = useState<Task>()
  const [snapshot, setSnapshot] = useState<WorktreeSnapshot>()
  const [taskName, setTaskName] = useState('')
  const [tab, setTab] = useState<'files' | 'changes'>('files')
  const [file, setFile] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<FilePreview>()
  const [previewError, setPreviewError] = useState('')

  useEffect(() => {
    setPreview(undefined)
    setPreviewError('')
    if (!task || !file || !snapshot) return

    let current = true
    window.workspace.previewFile(task.directory, file).then(
      (result) => { if (current) setPreview(result) },
      (failure: unknown) => { if (current) setPreviewError(errorMessage(failure)) },
    )
    return () => { current = false }
  }, [task, file, snapshot])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  async function selectTask(next: Task) {
    setTask(next)
    setFile(undefined)
    setSnapshot(undefined)
    setTab('files')
    setSnapshot(await window.workspace.inspectTask(next.directory))
  }

  async function openRepository() {
    const opened = await window.workspace.openRepository()
    if (!opened) return

    setRepository(opened)
    setTask(undefined)
    setFile(undefined)
    setSnapshot(undefined)
    setTaskName('')
  }

  async function createTask() {
    const result = await window.workspace.createTask(taskName)
    setRepository(result.repository)
    setTaskName('')
    await selectTask(result.task)
  }

  async function refreshTask() {
    if (!task) return
    const updated = await window.workspace.inspectTask(task.directory)
    if (!updated.files.some((entry) => entry.path === file)) setFile(undefined)
    setSnapshot(updated)
  }

  const files = snapshot?.files ?? []
  const changes = files.filter((entry) => entry.status)
  const visibleFiles = tab === 'changes' ? changes : files

  return (
    <div className="app">
      <header className={navigator.platform.startsWith('Mac') ? 'titlebar mac' : 'titlebar'}>
        <span>Devin Multi-Agent IDE</span>
        <button disabled={busy} onClick={() => void run(openRepository)}>Open Repository…</button>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="Task worktrees">
          <div className="repository">
            <h2>Repository</h2>
            <strong title={repository?.directory}>{repository?.directory.split(/[/\\]/).pop() ?? 'No repository open'}</strong>
          </div>

          <div className="tasks">
            <h2>Tasks</h2>
            {repository?.tasks.map((entry) => (
              <button key={entry.directory} className="item task" aria-pressed={task?.directory === entry.directory}
                title={entry.branch} disabled={busy} onClick={() => void run(() => selectTask(entry))}>
                {entry.branch.slice('task/'.length)}
              </button>
            ))}
            {!repository?.tasks.length && <p className="muted">No task worktrees</p>}
          </div>

          {repository && (
            <form className="new-task" onSubmit={(event) => { event.preventDefault(); void run(createTask) }}>
              <label htmlFor="task-name">New task</label>
              <input id="task-name" autoComplete="off" placeholder="e.g. CSV export"
                value={taskName} onChange={(event) => setTaskName(event.target.value)} disabled={busy} />
              <button className="primary" disabled={busy || !taskName.trim()}>Create Worktree</button>
            </form>
          )}
        </aside>

        <main>
          {error && <div className="error" role="alert">{error}</div>}
          {task ? (
            <>
              <div className="task-header">
                <div className="task-heading">
                  <h1>{task.branch.slice('task/'.length)}</h1>
                  <div className="branch">
                    <span>{task.branch}</span>
                    {snapshot && <code title={snapshot.commit}>{snapshot.commit.slice(0, 8)}</code>}
                  </div>
                </div>
                <div className="actions">
                  <button disabled={busy} onClick={() => void run(refreshTask)}>Refresh</button>
                  <button disabled={busy} onClick={() => void run(() => window.workspace.revealTask(task.directory))}>
                    Reveal Worktree
                  </button>
                </div>
              </div>
              <div className="inspector">
                <section className="file-browser" aria-label="Worktree files">
                  <div className="tabs" aria-label="Filter files">
                    <button aria-pressed={tab === 'files'} onClick={() => setTab('files')}>Files <span>{files.length}</span></button>
                    <button aria-pressed={tab === 'changes'} onClick={() => setTab('changes')}>Changes <span>{changes.length}</span></button>
                  </div>
                  <div className="file-list">
                    {visibleFiles.map((entry) => (
                      <button key={entry.path} className="item file" title={entry.path} aria-pressed={file === entry.path}
                        onClick={() => setFile(entry.path)}>
                        <span>{entry.path}</span>
                        {entry.status && <code className="file-status">{entry.status}</code>}
                      </button>
                    ))}
                    {!visibleFiles.length && <p className="empty-list muted">
                      {busy ? 'Reading worktree…' : tab === 'changes' ? 'No uncommitted changes' : 'No files to display'}
                    </p>}
                  </div>
                </section>
                <section className="preview" aria-label="File preview">
                  {file ? (
                    <>
                      <div className="preview-title" title={file}>{file}</div>
                      {previewError && <p className="empty-list muted">{previewError}</p>}
                      {preview && <pre>{preview.text}</pre>}
                      {preview?.truncated && <p className="preview-note">Showing the first 128 KiB.</p>}
                    </>
                  ) : <p className="preview-empty muted">Select a file to preview it</p>}
                </section>
              </div>
              <div className="statusbar" title={task.directory}>{task.directory}</div>
            </>
          ) : (
            <section className="welcome">
              <div className="welcome-content">
                <h1>{repository ? 'Choose a task worktree' : 'Open a Git repository'}</h1>
                <p>{repository
                  ? 'Select a task from the sidebar or create a branch and worktree from the current commit.'
                  : 'Create a worktree for a coding task and inspect its files and uncommitted changes.'}</p>
                {!repository && <button className="primary" disabled={busy}
                  onClick={() => void run(openRepository)}>Choose Repository…</button>}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)

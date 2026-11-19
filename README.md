# Devin Multi-Agent IDE

A proposed macOS IDE for handing a coding task from one agent to another in the middle of an edit. Each task gets a Git worktree. A developer can stop Devin after it writes a backend handler, open the same files with a second agent, and finish the UI without copying patches or reconstructing the task from chat.

**Project status:** Architecture proposal for the first prototype. The workflow below describes the intended implementation.

## First demo: export the orders on screen

Open an orders app, filter the table to three orders, and ask for a CSV export that preserves the visible filters and sort order.

1. Start Devin in a new task worktree. Have it implement the export handler, then stop the session before it connects the button. Leave the new handler uncommitted.
2. Reopen the task. The IDE should show the new file, the original request, and the remaining UI work.
3. Select a second agent. It should be able to open the handler, trace how the table sends its filter and sort parameters, and wire the Export button to the same parameters.
4. Run the app in the task’s shell, reverse the table’s sort order, and click Export. Open the CSV and compare its order IDs with the screen. The demo succeeds when the same three IDs appear in the same sequence and the developer can review both agents’ edits together.

## Desktop architecture

| Component | Planned implementation | Responsibility |
| --- | --- | --- |
| Desktop UI | Electron renderer, React, TypeScript | Task selection, editor tabs, terminal panes, and handoff controls |
| Editor | Monaco | Display and edit files rooted in the selected worktree |
| Local backend | Electron main process, Node.js, TypeScript | Own task state, invoke Git, read and write files, and manage subprocesses |
| Terminal | xterm.js in the renderer, node-pty in the backend | Display interactive sessions and connect keyboard input and resize events to the right process |
| Agent runtime | Locally installed Devin CLI for the first integration | Read and edit files and run commands from the task directory |
| Persistence | Git worktrees and SQLite | Keep code changes on disk and associate them with a task, its starting commit, and its handoff notes |

## From “Start task” to a live terminal

The backend resolves the selected revision to a commit SHA. For the demo, it would create the branch and working directory with the following command, substituting the recorded SHA for the placeholder.

```sh
git worktree add -b task/csv-export ../orders-csv <base-sha>
```

The IDE opens that directory in the editor and launches the installed Devin executable with the same working directory. The launch in the Node.js backend would look like this:

```ts
const agentPty = pty.spawn(devinPath, [], {
  cwd: worktreePath,
  name: 'xterm-256color',
  cols: terminalColumns,
  rows: terminalRows,
})
```

The main process assigns the PTY a session ID. A preload bridge carries keyboard input from xterm.js over Electron IPC to the matching PTY’s `write()` method. The PTY’s `onData` callback sends output back to that pane. When the pane changes size, the backend calls `resize(cols, rows)`.

A second PTY runs the developer’s shell in the same directory. The developer can start the app there and continue interacting with Devin in the first pane. Switching tabs keeps both processes running. Quitting the app closes the processes. The worktree and task record persist.

## What the next agent receives

The developer selects the next agent at an explicit handoff. The outgoing agent finishes its current edit or its process exits before the incoming agent can write. The IDE resolves any unsaved editor buffer with the developer before handing over the on-disk files.

SQLite holds the task ID, original request, base commit, branch, absolute worktree path, last recorded step, and next open question. At handoff the backend reads the current HEAD, lists changed and untracked files, and gathers tracked changes relative to the base commit. A new handler may be present only as an untracked file, so the handoff includes its path and the incoming agent can open it directly.

For the CSV demo, a handoff note might read:

> The export handler is in the worktree. The button still needs to pass the table’s active filters and sort order. Open the handler and the table request before editing.

The first integration uses Devin CLI. A second local agent, such as a Claude- or GPT-based coding agent, can use the same worktree and handoff record. The developer chooses which agent takes the next turn.

## Recovery after an interrupted session

If Devin exits mid-task, the backend marks its session as interrupted. On reopening the task, it compares the stored path and branch with `git worktree list --porcelain`, then reads HEAD and `git status --short` inside the verified directory. A fresh session can inspect the actual changes, including work completed after the last saved handoff note.

If an agent described a handler as committed and Git lists it as untracked, the IDE surfaces the file with its actual status. If the directory is missing or points to a different branch, the IDE shows the expected and observed checkout and lets the developer resolve the mismatch before resuming edits.

## First implementation milestone

Open a local repository, create one task worktree, launch Devin inside it, and display a file it edits in Monaco. Once that path works, add the second terminal and task persistence, then demonstrate the interrupted CSV task end to end.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Repository, WorktreeSnapshot } from './workspace-api'

const execFileAsync = promisify(execFile)

export async function git(directory: string, ...args: string[]) {
  const { stdout } = await execFileAsync('git', ['-C', directory, ...args], {
    maxBuffer: 16 * 1024 * 1024,
  })
  return stdout
}

export async function readRepository(directory: string): Promise<Repository> {
  const output = await git(directory, 'worktree', 'list', '--porcelain', '-z')
  const tasks = output.split('\0\0').flatMap((record) => {
    const fields = record.split('\0')
    const worktree = fields.find((field) => field.startsWith('worktree '))
    const branch = fields.find((field) => field.startsWith('branch refs/heads/task/'))
    if (!worktree || !branch) return []

    return [{
      directory: worktree.slice('worktree '.length),
      branch: branch.slice('branch refs/heads/'.length),
    }]
  })

  return { directory, tasks }
}

export async function inspectWorktree(directory: string): Promise<WorktreeSnapshot> {
  const [head, fileList, status] = await Promise.all([
    git(directory, 'rev-parse', 'HEAD'),
    git(directory, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'),
    git(directory, 'status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all'),
  ])

  const changes = new Map<string, string>()
  for (const entry of status.split('\0').filter(Boolean)) {
    changes.set(entry.slice(3), entry.slice(0, 2).trim())
  }

  const paths = new Set([...fileList.split('\0').filter(Boolean), ...changes.keys()])
  const files = [...paths].sort((a, b) => a.localeCompare(b)).map((path) => ({
    path,
    status: changes.get(path),
  }))

  return { commit: head.trim(), files }
}

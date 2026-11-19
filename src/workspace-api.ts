export interface Task {
  branch: string
  directory: string
}

export interface Repository {
  directory: string
  tasks: Task[]
}

export interface WorktreeFile {
  path: string
  status?: string
}

export interface WorktreeSnapshot {
  commit: string
  files: WorktreeFile[]
}

export interface FilePreview {
  text: string
  truncated: boolean
}

export interface WorkspaceApi {
  openRepository(): Promise<Repository | null>
  createTask(name: string): Promise<{ repository: Repository; task: Task }>
  inspectTask(directory: string): Promise<WorktreeSnapshot>
  previewFile(directory: string, path: string): Promise<FilePreview>
  revealTask(directory: string): Promise<void>
}

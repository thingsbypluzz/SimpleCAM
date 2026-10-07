import { sanitizeProjectName } from './projectFile'

// The project the preset slots belong to (BL-112): the name shown in the
// Header and the slots' fingerprint at the last Save/Load, kept next to the
// slots themselves so both survive a reload. `name: null` — no project has
// been saved or loaded yet ("Untitled").
export interface ProjectInfo {
  name: string | null
  fingerprint: string | null
}

export const PROJECT_STORAGE_KEY = 'simplecam.project'
export const NO_PROJECT: ProjectInfo = { name: null, fingerprint: null }

export function loadProjectInfo(): ProjectInfo {
  try {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY)
    if (!raw) return NO_PROJECT
    const parsed = JSON.parse(raw) as Partial<ProjectInfo> | null
    const name = typeof parsed?.name === 'string' ? sanitizeProjectName(parsed.name) : ''
    if (!name) return NO_PROJECT
    return { name, fingerprint: typeof parsed?.fingerprint === 'string' ? parsed.fingerprint : null }
  } catch (err) {
    console.warn('OnlyPaths: could not read the project name from localStorage', err)
    return NO_PROJECT
  }
}

export function saveProjectInfo(info: ProjectInfo): void {
  try {
    if (info.name === null) localStorage.removeItem(PROJECT_STORAGE_KEY)
    else localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(info))
  } catch (err) {
    console.warn('OnlyPaths: could not save the project name to localStorage', err)
  }
}

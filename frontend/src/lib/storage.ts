const STORAGE_KEY = 'blockchain-observatory:v1'
export interface Preferences {
  selected: string | null
  autoRefresh: boolean
}
export const defaultPreferences = (): Preferences => ({
  selected: null,
  autoRefresh: true,
})

export function readPreferences(): Preferences {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!raw || typeof raw !== 'object') return defaultPreferences()
    const item = raw as Record<string, unknown>
    return {
      selected: typeof item.selected === 'string' ? item.selected : null,
      autoRefresh: item.autoRefresh !== false,
    }
  } catch {
    return defaultPreferences()
  }
}

export function savePreferences(preferences: Preferences): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
    return true
  } catch {
    return false
  }
}

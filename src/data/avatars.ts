export interface AvatarOption {
  id: string
  name: string
  role: string
  tone: string
  accent: string
}

/** Character identities used by onboarding until individual portrait assets are supplied. */
export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'founder-1', name: 'Tunde', role: 'The builder', tone: '#f5c6a5', accent: '#315bea' },
  { id: 'founder-2', name: 'Amara', role: 'The strategist', tone: '#8d5524', accent: '#e0483d' },
  { id: 'founder-3', name: 'Kelechi', role: 'The operator', tone: '#c68642', accent: '#32b879' },
  { id: 'founder-4', name: 'Zainab', role: 'The connector', tone: '#6b3e26', accent: '#a78bfa' },
]

import { create } from 'zustand'
import { ApiError, api, getToken, setToken } from '../api/client'

export type UserRole = 'PLAYER' | 'ADMIN' | 'LECTURER'

export interface SessionUser {
  id: string
  email: string
  fullName: string
  role: UserRole
  emailVerified: boolean
  createdAt: string
}

export interface BusinessProfile {
  id: string
  userId: string
  businessName: string
  sector: string
  idea: string
  description: string
  problem: string
  product: string
  ambition: string | null
  avatarId: string
  createdAt: string
  updatedAt: string
}

interface RegisterResult {
  user: SessionUser
  token?: string
}

interface AuthState {
  status: 'loading' | 'anonymous' | 'authenticated'
  user: SessionUser | null
  profile: BusinessProfile | null
  /** Email awaiting verification, carried between the register and verify screens. */
  pendingEmail: string | null
  /** Email a password-reset code was requested for, carried to the reset step. */
  resetEmail: string | null
  /** Development-only code display retained for the temporary local fallback. */
  devCode: string | null
  error: string | null

  bootstrap: () => Promise<void>
  register: (fullName: string, email: string, password: string) => Promise<void>
  verifyEmail: (code: string) => Promise<void>
  resendCode: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  resetPassword: (email: string, code: string, password: string) => Promise<void>
  logout: () => void
  loadProfile: () => Promise<void>
  saveProfile: (input: Partial<BusinessProfile>) => Promise<BusinessProfile>
  setError: (message: string | null) => void
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}

/**
 * Session + identity. Holds only what the server has confirmed about the
 * signed-in user, plus the business profile they created.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  profile: null,
  pendingEmail: null,
  resetEmail: null,
  devCode: null,
  error: null,

  async bootstrap() {
    const token = getToken()
    if (!token) {
      set({ status: 'anonymous' })
      return
    }
    try {
      const { user } = await api<{ user: SessionUser }>('/auth/me')
      set({ status: 'authenticated', user })
      if (user.role === 'PLAYER') {
        try {
          const { profile } = await api<{ profile: BusinessProfile | null }>('/player/profile')
          set({ profile })
        } catch {
          /* a player without a profile yet is a normal state */
        }
      }
    } catch {
      setToken(null)
      set({ status: 'anonymous', user: null, profile: null })
    }
  },

  async register(fullName, email, password) {
    set({ error: null })
    try {
      const result = await api<RegisterResult>('/auth/register', {
        method: 'POST',
        anonymous: true,
        body: { fullName, email, password },
      })
      if (result.token) {
        setToken(result.token)
        set({ pendingEmail: null, user: result.user, status: 'authenticated' })
        if (result.user.role === 'PLAYER') {
          try {
            const { profile } = await api<{ profile: BusinessProfile | null }>('/player/profile')
            set({ profile })
          } catch {
            /* a player without a profile yet is a normal state */
          }
        }
      } else {
        set({ pendingEmail: result.user.email, user: null, status: 'anonymous' })
      }
    } catch (error) {
      set({ error: toMessage(error) })
      throw error
    }
  },

  async verifyEmail(code) {
    set({ error: null })
    const email = get().pendingEmail
    if (!email) {
      const message = 'Start again from the sign-up page.'
      set({ error: message })
      throw new Error(message)
    }
    try {
      const { token, user } = await api<{ token: string; user: SessionUser }>('/auth/verify-email', {
        method: 'POST',
        anonymous: true,
        body: { email, code },
      })
      setToken(token)
      set({ status: 'authenticated', user, pendingEmail: null, devCode: null })
    } catch (error) {
      set({ error: toMessage(error) })
      throw error
    }
  },

  async resendCode() {
    const email = get().pendingEmail
    if (!email) return
    set({ error: null })
    try {
      const result = await api<{ ok: true; devVerificationCode?: string }>('/auth/resend-code', {
        method: 'POST',
        anonymous: true,
        body: { email },
      })
      set({ devCode: result.devVerificationCode ?? null })
    } catch (error) {
      set({ error: toMessage(error) })
    }
  },

  async requestPasswordReset(email) {
    set({ error: null, resetEmail: email.trim().toLowerCase() })
    try {
      await api<{ ok: true }>('/auth/forgot-password', {
        method: 'POST',
        anonymous: true,
        body: { email: email.trim() },
      })
    } catch (error) {
      set({ error: toMessage(error) })
      throw error
    }
  },

  async resetPassword(email, code, password) {
    set({ error: null })
    try {
      await api<{ ok: true }>('/auth/reset-password', {
        method: 'POST',
        anonymous: true,
        body: { email: email.trim(), code: code.trim(), password },
      })
      set({ resetEmail: null })
    } catch (error) {
      set({ error: toMessage(error) })
      throw error
    }
  },

  async login(email, password) {
    set({ error: null })
    try {
      const { token, user } = await api<{ token: string; user: SessionUser }>('/auth/login', {
        method: 'POST',
        anonymous: true,
        body: { email, password },
      })
      setToken(token)
      set({ status: 'authenticated', user, pendingEmail: null, devCode: null })
      if (user.role === 'PLAYER') {
        try {
          const { profile } = await api<{ profile: BusinessProfile | null }>('/player/profile')
          set({ profile })
        } catch {
          /* ignore — profile is optional at this stage */
        }
      }
    } catch (error) {
      set({ error: toMessage(error) })
      throw error
    }
  },

  logout() {
    setToken(null)
    set({
      status: 'anonymous',
      user: null,
      profile: null,
      pendingEmail: null,
      devCode: null,
      error: null,
    })
  },

  async loadProfile() {
    try {
      const { profile } = await api<{ profile: BusinessProfile | null }>('/player/profile')
      set({ profile })
    } catch {
      set({ profile: null })
    }
  },

  async saveProfile(input) {
    const { profile } = await api<{ profile: BusinessProfile }>('/player/profile', {
      method: 'PUT',
      body: input,
    })
    set({ profile })
    return profile
  },

  setError(message) {
    set({ error: message })
  },
}))

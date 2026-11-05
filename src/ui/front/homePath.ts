import type { BusinessProfile, SessionUser } from '../../state/authStore'

/**
 * Where each role belongs after signing in. Kept in one place so the register,
 * verify and login screens cannot disagree about it.
 */
export function homePathFor(user: SessionUser, profile: BusinessProfile | null): string {
  if (user.role === 'ADMIN') return '/admin'
  if (user.role === 'LECTURER') return '/lecturer'
  return profile ? '/play' : '/onboarding/business'
}

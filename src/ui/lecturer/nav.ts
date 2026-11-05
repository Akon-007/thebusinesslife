import type { PortalNavGroup } from '../admin/nav'

/**
 * The lecturer portal's navigation, exactly as specified.
 *
 * Every section here has a screen behind it, so nothing is shown disabled. The
 * paths are relative to the portal root (`/lecturer`).
 */
export const LECTURER_NAV: PortalNavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', path: '', built: true }],
  },
  {
    label: 'Classes',
    items: [
      { label: 'My Classes', path: 'classes', built: true },
      { label: 'Students', path: 'students', built: true },
      { label: 'Student Companies', path: 'companies', built: true },
    ],
  },
  {
    label: 'Teaching',
    items: [
      { label: 'Assignments', path: 'assignments', built: true },
      { label: 'Scenario Builder', path: 'scenarios', built: true },
      { label: 'Learning Objectives', path: 'objectives', built: true },
    ],
  },
  {
    label: 'Live Simulation',
    items: [
      { label: 'Live Classroom', path: 'live', built: true },
      { label: 'Economic Events', path: 'events', built: true },
    ],
  },
  {
    label: 'Assessment',
    items: [
      { label: 'Performance', path: 'performance', built: true },
      { label: 'Grading', path: 'grading', built: true },
      { label: 'Leaderboard', path: 'leaderboard', built: true },
      { label: 'Reports', path: 'reports', built: true },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Notifications', path: 'notifications', built: true },
      { label: 'Settings', path: 'settings', built: true },
    ],
  },
]

/**
 * The administrator portal's navigation, exactly as specified.
 *
 * `built` marks the sections whose screens exist. Everything else is shown
 * disabled rather than linking to a dead page, so the portal never pretends to
 * offer something it cannot do yet.
 */

export interface PortalNavItem {
  label: string
  /** Route path, relative to the portal root. */
  path: string
  built: boolean
}

export interface PortalNavGroup {
  label: string
  items: PortalNavItem[]
}

export const ADMIN_NAV: PortalNavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', path: '', built: true }],
  },
  {
    label: 'Game Management',
    items: [
      { label: 'Players', path: 'players', built: true },
      { label: 'Stages & Levels', path: 'stages', built: true },
      { label: 'Mission Builder', path: 'missions', built: true },
      { label: 'NPC Management', path: 'npcs', built: true },
      { label: 'Investor Management', path: 'investors', built: true },
      { label: 'Business Sectors', path: 'sectors', built: true },
      { label: 'City Management', path: 'city', built: true },
    ],
  },
  {
    label: 'Simulation Control',
    items: [
      { label: 'World Clock', path: 'clock', built: true },
      { label: 'Economy & Market Conditions', path: 'economy', built: true },
      { label: 'Simulation Rules', path: 'rules', built: true },
      { label: 'Compliance & Regulations', path: 'compliance', built: true },
      { label: 'Events Management', path: 'events', built: true },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Analytics', path: 'analytics', built: true },
      { label: 'Activity Logs', path: 'logs', built: true },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Users & Permissions', path: 'users', built: true },
      { label: 'Settings', path: 'settings', built: true },
    ],
  },
]

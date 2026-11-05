export type IconName =
  | 'phone'
  | 'building'
  | 'map'
  | 'gear'
  | 'bell'
  | 'close'
  | 'coin'
  | 'star'
  | 'people'
  | 'target'
  | 'handshake'
  | 'tag'
  | 'briefcase'
  | 'sun'
  | 'moon'
  | 'monitor'

interface IconProps {
  name: IconName
  size?: number
}

/**
 * Small stroked SVG icons for the HUD. Drawn inline so the interface never
 * waits on an icon font or an image request.
 */
export function Icon({ name, size = 18 }: IconProps) {
  const svg = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (name) {
    case 'phone':
      return (
        <svg {...svg}>
          <path d="M6.6 3h3l1.4 3.8-2 1.4a12.5 12.5 0 0 0 5.8 5.8l1.4-2L20 13.4v3a2.4 2.4 0 0 1-2.6 2.4A16.6 16.6 0 0 1 3.6 5.6 2.4 2.4 0 0 1 6 3Z" />
        </svg>
      )
    case 'building':
      return (
        <svg {...svg}>
          <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V21" />
          <path d="M14 10h4.5A1.5 1.5 0 0 1 20 11.5V21" />
          <path d="M3 21h18M7 8h1.5M7 12h1.5M7 16h1.5M16.5 14h1M16.5 17.5h1" />
        </svg>
      )
    case 'map':
      return (
        <svg {...svg}>
          <path d="M9 4 3.6 6.2A1 1 0 0 0 3 7.1v12.2a.8.8 0 0 0 1.1.7L9 18l6 2 5.4-2.2a1 1 0 0 0 .6-.9V4.7a.8.8 0 0 0-1.1-.7L15 6 9 4Z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
      )
    case 'gear':
      return (
        <svg {...svg}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-3-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H2.8a2 2 0 1 1 0-4H3a1.7 1.7 0 0 0 1.2-3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 17 4.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 10h.2a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </svg>
      )
    case 'bell':
      return (
        <svg {...svg}>
          <path d="M18 8.6a6 6 0 1 0-12 0c0 4.6-1.6 5.9-2.4 6.6a.9.9 0 0 0 .6 1.6h15.6a.9.9 0 0 0 .6-1.6c-.8-.7-2.4-2-2.4-6.6Z" />
          <path d="M10.2 20a2 2 0 0 0 3.6 0" />
        </svg>
      )
    case 'close':
      return (
        <svg {...svg}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      )
    case 'coin':
      return (
        <svg {...svg}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.5 9.5h5M9.5 14.5h5M12 7v10M10 12h4" />
        </svg>
      )
    case 'star':
      return (
        <svg {...svg}>
          <path d="M12 3.6l2.5 5.2 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8Z" />
        </svg>
      )
    case 'people':
      return (
        <svg {...svg}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M2.8 20a6.2 6.2 0 0 1 12.4 0M16.5 5.4a3.2 3.2 0 0 1 0 6.2M18 14.4a6.2 6.2 0 0 1 3.2 5.6" />
        </svg>
      )
    case 'target':
      return (
        <svg {...svg}>
          <circle cx="12" cy="12" r="8.4" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="12" cy="12" r="0.9" fill="currentColor" />
        </svg>
      )
    case 'handshake':
      return (
        <svg {...svg}>
          <path d="M3 12.5l3.5-3.5 3 2 3-2 3 2L19 8.5 21 10.5" />
          <path d="M6.5 9 3 12.5l3.5 3.5 2-2 2.5 2.5 2.5-2.5 2 2L21 12.5l-2-2" />
        </svg>
      )
    case 'tag':
      return (
        <svg {...svg}>
          <path d="M11.2 3H20v8.8L11.6 20.2a1.6 1.6 0 0 1-2.3 0l-5.5-5.5a1.6 1.6 0 0 1 0-2.3Z" />
          <circle cx="16.3" cy="7.7" r="1.3" />
        </svg>
      )
    case 'briefcase':
      return (
        <svg {...svg}>
          <rect x="3" y="7.5" width="18" height="12.5" rx="2" />
          <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3 13h18" />
        </svg>
      )
    case 'sun':
      return (
        <svg {...svg}>
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.6v2M12 19.4v2M2.6 12h2M19.4 12h2M5.4 5.4l1.4 1.4M17.2 17.2l1.4 1.4M18.6 5.4l-1.4 1.4M6.8 17.2l-1.4 1.4" />
        </svg>
      )
    case 'moon':
      return (
        <svg {...svg}>
          <path d="M20 13.4A8.4 8.4 0 0 1 10.6 4a8.5 8.5 0 1 0 9.4 9.4Z" />
        </svg>
      )
    case 'monitor':
      return (
        <svg {...svg}>
          <rect x="3" y="4.5" width="18" height="12.5" rx="2" />
          <path d="M8.5 20.5h7M12 17v3.5" />
        </svg>
      )
    default:
      return null
  }
}

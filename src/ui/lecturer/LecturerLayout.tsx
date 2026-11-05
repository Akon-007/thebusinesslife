import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../state/authStore'
import { LECTURER_NAV } from './nav'

/**
 * The lecturer portal shell: the same persistent sidebar as the administrator
 * console, drawn with the lecturer's own navigation.
 *
 * Access control is not done here — the route guard and, decisively, the API
 * both refuse anyone without the LECTURER role. This component only draws.
 */
export function LecturerLayout() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const location = useLocation()

  const current = LECTURER_NAV.flatMap((g) => g.items).find(
    (item) =>
      item.path === '' ? location.pathname === '/lecturer' : location.pathname.startsWith(`/lecturer/${item.path}`),
  )

  return (
    <div className="front portal">
      <aside className="pf-side">
        <div className="pf-side__brand">
          <span className="pf-side__mark">B</span>
          <span>BUSINESSLIFE</span>
        </div>
        <div className="pf-side__portal">Lecturer</div>

        <nav className="pf-nav">
          {LECTURER_NAV.map((group) => (
            <div className="pf-nav__group" key={group.label}>
              <div className="pf-nav__label">{group.label}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path === '' ? '/lecturer' : `/lecturer/${item.path}`}
                  end={item.path === ''}
                  className={({ isActive }) => `pf-nav__item${isActive ? ' pf-nav__item--active' : ''}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="pf-main">
        <header className="pf-top">
          <div>
            <div className="pf-top__title">{current?.label ?? 'Dashboard'}</div>
            <div className="pf-top__sub">BUSINESSLIFE teaching console</div>
          </div>

          <div className="pf-top__right">
            <div className="pf-who">
              <div className="pf-who__name">{user?.fullName}</div>
              <div className="pf-who__role">Lecturer</div>
            </div>
            <Link className="fo-btn fo-btn--ghost" to="/">
              Home
            </Link>
            <button className="fo-btn fo-btn--ghost" type="button" onClick={logout}>
              Sign out
            </button>
          </div>
        </header>

        <div className="pf-body">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

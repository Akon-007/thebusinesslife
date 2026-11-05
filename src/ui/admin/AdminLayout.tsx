import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../state/authStore'
import { ADMIN_NAV } from './nav'

/**
 * The administrator portal shell: persistent sidebar navigation with the
 * content area beside it.
 *
 * Access control is not done here — the route guard and, decisively, the API
 * both refuse anyone without the ADMIN role. This component only draws.
 */
export function AdminLayout() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const location = useLocation()

  const current = ADMIN_NAV.flatMap((g) => g.items).find(
    (item) => (item.path === '' ? location.pathname === '/admin' : location.pathname.startsWith(`/admin/${item.path}`)),
  )

  return (
    <div className="front portal">
      <aside className="pf-side">
        <div className="pf-side__brand">
          <span className="pf-side__mark">B</span>
          <span>BUSINESSLIFE</span>
        </div>
        <div className="pf-side__portal">Administrator</div>

        <nav className="pf-nav">
          {ADMIN_NAV.map((group) => (
            <div className="pf-nav__group" key={group.label}>
              <div className="pf-nav__label">{group.label}</div>
              {group.items.map((item) =>
                item.built ? (
                  <NavLink
                    key={item.path}
                    to={item.path === '' ? '/admin' : `/admin/${item.path}`}
                    end={item.path === ''}
                    className={({ isActive }) => `pf-nav__item${isActive ? ' pf-nav__item--active' : ''}`}
                  >
                    {item.label}
                  </NavLink>
                ) : (
                  <span
                    key={item.path}
                    className="pf-nav__item pf-nav__item--disabled"
                    title="Not built yet"
                    aria-disabled="true"
                  >
                    {item.label}
                    <span className="pf-nav__soon">soon</span>
                  </span>
                ),
              )}
            </div>
          ))}
        </nav>
      </aside>

      <div className="pf-main">
        <header className="pf-top">
          <div>
            <div className="pf-top__title">{current?.label ?? 'Dashboard'}</div>
            <div className="pf-top__sub">BUSINESSLIFE game operations</div>
          </div>

          <div className="pf-top__right">
            <div className="pf-who">
              <div className="pf-who__name">{user?.fullName}</div>
              <div className="pf-who__role">Administrator</div>
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

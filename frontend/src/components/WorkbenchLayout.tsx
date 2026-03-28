import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

const NAV_ITEMS = [
  {
    section: "DEMO",
    links: [{ to: "/", label: "Customer Support" }],
  },
  {
    section: "WORKBENCH",
    links: [
      { to: "/workbench", label: "Dashboard", end: true },
      { to: "/workbench/agents", label: "Agent Specs" },
      { to: "/workbench/map", label: "Map" },
    ],
  },
];

function pageTitle(pathname: string): string {
  if (pathname === "/workbench") return "Dashboard";
  if (pathname === "/workbench/map") return "Agent Architecture Map";
  if (pathname.includes("/agents")) return "Agent Specs";
  if (pathname.includes("/usecases")) return "Playground";
  if (pathname.includes("/systems")) return "System Detail";
  return "Workbench";
}

function parentPath(pathname: string): { to: string; label: string } | null {
  if (pathname.includes("/usecases/")) {
    // /workbench/systems/:id/usecases/:ucId → back to system
    const sysId = pathname.split("/systems/")[1]?.split("/")[0];
    return sysId ? { to: `/workbench/systems/${sysId}`, label: "System Detail" } : null;
  }
  if (pathname.match(/\/systems\/[^/]+$/)) {
    return { to: "/workbench", label: "Dashboard" };
  }
  if (pathname.match(/\/agents\/[^/]+$/)) {
    return { to: "/workbench/agents", label: "Agent Specs" };
  }
  return null;
}

export default function WorkbenchLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const parent = parentPath(pathname);

  return (
    <div className="flex h-screen overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-[260px] shrink-0 bg-tedee-navy flex flex-col text-gray-300">
        <div className="px-6 pt-5 pb-4">
          <h2 className="text-lg font-bold text-white tracking-tight">HelloAgents</h2>
        </div>

        <nav className="flex-1 overflow-y-auto">
          {NAV_ITEMS.map((group) => (
            <div key={group.section} className="mb-4">
              <p className="px-6 pb-2 text-[10px] uppercase tracking-[0.15em] text-tedee-gray font-medium">
                {group.section}
              </p>
              {group.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={("end" in link) ? link.end : undefined}
                  className={({ isActive }) =>
                    `block px-6 py-2.5 text-sm transition-colors ${
                      isActive
                        ? "text-tedee-cyan bg-white/10 border-l-[3px] border-tedee-cyan"
                        : "text-gray-300 hover:text-white hover:bg-white/5 border-l-[3px] border-transparent"
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="px-6 py-4 text-[11px] text-tedee-gray/60">
          v1.0.0
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header bar */}
        <header className="h-14 shrink-0 bg-white border-b border-gray-200 flex items-center px-6 gap-3">
          {parent && (
            <>
              <button
                onClick={() => navigate(parent.to)}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-tedee-cyan transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                  <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {parent.label}
              </button>
              <span className="text-gray-300">/</span>
            </>
          )}
          <h1 className="text-xl font-bold text-tedee-navy">
            {pageTitle(pathname)}
          </h1>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-bg-light p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

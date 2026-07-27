import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useApp } from './context/AppContext.jsx'
import { ClientTabs, ManagerTabs, AdminTabs } from './components/ui.jsx'

import Landing from './pages/Landing.jsx'
import Auth from './pages/Auth.jsx'

import ClientHome from './pages/client/Home.jsx'
import Search from './pages/client/Search.jsx'
import StorePage from './pages/client/StorePage.jsx'
import Cart from './pages/client/Cart.jsx'
import Checkout from './pages/client/Checkout.jsx'
import Payment from './pages/client/Payment.jsx'
import Track from './pages/client/Track.jsx'
import ClientOrders from './pages/client/Orders.jsx'
import Account from './pages/client/Account.jsx'

import ManagerDashboard from './pages/manager/Dashboard.jsx'
import ManagerProducts from './pages/manager/Products.jsx'
import ManagerOrders from './pages/manager/Orders.jsx'
import StoreSetup from './pages/manager/StoreSetup.jsx'

import DriverDashboard from './pages/driver/Dashboard.jsx'

import AdminOverview from './pages/admin/Overview.jsx'
import AdminStores from './pages/admin/Stores.jsx'
import AdminDrivers from './pages/admin/Drivers.jsx'
import AdminFinance from './pages/admin/Finance.jsx'
import AdminConfig from './pages/admin/Config.jsx'

function homeFor(role) {
  if (role === 'MANAGER') return '/manager'
  if (role === 'DRIVER') return '/driver'
  if (role === 'SUPERADMIN') return '/admin'
  return '/client'
}

function RequireRole({ role, children, tabs }) {
  const { user, authReady } = useApp()
  const loc = useLocation()
  if (!authReady) return <div className="screen"><p className="muted">Chargement…</p></div>
  if (!user) return <Navigate to="/" state={{ from: loc.pathname }} replace />
  if (role && user.role !== role) return <Navigate to={homeFor(user.role)} replace />
  return (
    <>
      {children}
      {tabs}
    </>
  )
}

export default function App() {
  const { user, authReady } = useApp()

  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={authReady && user ? <Navigate to={homeFor(user.role)} replace /> : <Landing />} />
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/register" element={<Auth mode="register" />} />

        {/* Client */}
        <Route path="/client" element={<RequireRole role="CLIENT" tabs={<ClientTabs />}><ClientHome /></RequireRole>} />
        <Route path="/client/orders" element={<RequireRole role="CLIENT" tabs={<ClientTabs />}><ClientOrders /></RequireRole>} />
        <Route path="/client/account" element={<RequireRole role="CLIENT" tabs={<ClientTabs />}><Account /></RequireRole>} />
        <Route path="/client/search" element={<RequireRole role="CLIENT" tabs={<ClientTabs />}><Search /></RequireRole>} />
        <Route path="/client/store/:id" element={<RequireRole role="CLIENT"><StorePage /></RequireRole>} />
        <Route path="/client/cart" element={<RequireRole role="CLIENT"><Cart /></RequireRole>} />
        <Route path="/client/checkout" element={<RequireRole role="CLIENT"><Checkout /></RequireRole>} />
        <Route path="/client/pay/:orderId" element={<RequireRole role="CLIENT"><Payment /></RequireRole>} />
        <Route path="/client/track/:orderId" element={<RequireRole role="CLIENT"><Track /></RequireRole>} />

        {/* Manager */}
        <Route path="/manager" element={<RequireRole role="MANAGER" tabs={<ManagerTabs />}><ManagerDashboard /></RequireRole>} />
        <Route path="/manager/products" element={<RequireRole role="MANAGER" tabs={<ManagerTabs />}><ManagerProducts /></RequireRole>} />
        <Route path="/manager/orders" element={<RequireRole role="MANAGER" tabs={<ManagerTabs />}><ManagerOrders /></RequireRole>} />
        <Route path="/manager/store" element={<RequireRole role="MANAGER" tabs={<ManagerTabs />}><StoreSetup /></RequireRole>} />

        {/* Livreur */}
        <Route path="/driver" element={<RequireRole role="DRIVER"><DriverDashboard /></RequireRole>} />

        {/* Super-admin */}
        <Route path="/admin" element={<RequireRole role="SUPERADMIN" tabs={<AdminTabs />}><AdminOverview /></RequireRole>} />
        <Route path="/admin/stores" element={<RequireRole role="SUPERADMIN" tabs={<AdminTabs />}><AdminStores /></RequireRole>} />
        <Route path="/admin/drivers" element={<RequireRole role="SUPERADMIN" tabs={<AdminTabs />}><AdminDrivers /></RequireRole>} />
        <Route path="/admin/finance" element={<RequireRole role="SUPERADMIN" tabs={<AdminTabs />}><AdminFinance /></RequireRole>} />
        <Route path="/admin/config" element={<RequireRole role="SUPERADMIN" tabs={<AdminTabs />}><AdminConfig /></RequireRole>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

import { RouterProvider } from 'react-router-dom'
import { SettingsEffects } from '../components/settings'
import { router } from './router'
import { SessionBootstrap } from '../components/auth/SessionBootstrap'
import { InstallAppProvider } from '../features/install-app'
import { CareThemeEffects } from '../features/care-theme/CareThemeEffects'
import { FAMILY_WORKSPACE_PATH } from '../../shared/family-workspace.mjs'

export function App() {
  if (window.location.pathname === FAMILY_WORKSPACE_PATH || window.location.pathname.startsWith(`${FAMILY_WORKSPACE_PATH}/`)) return <RouterProvider router={router} />
  return <InstallAppProvider><SettingsEffects /><SessionBootstrap><CareThemeEffects /><RouterProvider router={router} /></SessionBootstrap></InstallAppProvider>
}

import { RouterProvider } from 'react-router-dom'
import { SettingsEffects } from '../components/settings'
import { router } from './router'
import { SessionBootstrap } from '../components/auth/SessionBootstrap'
import { InstallAppProvider } from '../features/install-app'
import { CareThemeEffects } from '../features/care-theme/CareThemeEffects'

export function App() {
  return <InstallAppProvider><SettingsEffects /><SessionBootstrap><CareThemeEffects /><RouterProvider router={router} /></SessionBootstrap></InstallAppProvider>
}

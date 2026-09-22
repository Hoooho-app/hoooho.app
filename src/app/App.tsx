import { RouterProvider } from 'react-router-dom'
import { SettingsEffects } from '../components/settings'
import { router } from './router'
import { SessionBootstrap } from '../components/auth/SessionBootstrap'
import { InstallAppProvider } from '../features/install-app'

export function App() {
  return <InstallAppProvider><SettingsEffects /><SessionBootstrap><RouterProvider router={router} /></SessionBootstrap></InstallAppProvider>
}

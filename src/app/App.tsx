import { RouterProvider } from 'react-router-dom'
import { SettingsEffects } from '../components/settings'
import { router } from './router'
import { SessionBootstrap } from '../components/auth/SessionBootstrap'

export function App() {
  return <><SettingsEffects /><SessionBootstrap><RouterProvider router={router} /></SessionBootstrap></>
}

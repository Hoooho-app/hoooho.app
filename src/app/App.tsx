import { RouterProvider } from 'react-router-dom'
import { SettingsEffects } from '../components/settings'
import { router } from './router'
import { SessionBootstrap } from '../components/auth/SessionBootstrap'
import { CareThemeEffects } from '../features/care-theme/CareThemeEffects'
import { PageAppearanceEffects } from '../components/common/PageAppearanceEffects'

export function App() {
  return <><SettingsEffects /><PageAppearanceEffects /><SessionBootstrap><CareThemeEffects /><RouterProvider router={router} /></SessionBootstrap></>
}

import { useLocation, useNavigate } from 'react-router-dom'
import { Onboarding } from './Onboarding'
import { completeWelcome } from './welcomeState'

// An explicit public route also lets an existing user revisit the brand story.
export function WelcomePage() {
  const navigate = useNavigate()
  const location = useLocation()
  return <Onboarding onComplete={() => {
    completeWelcome()
    navigate('/login', { replace: true, state: location.state })
  }} />
}

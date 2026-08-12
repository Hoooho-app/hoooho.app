import { Navigate, createBrowserRouter } from 'react-router-dom'
import { HealthEventDetailPage } from '../pages/HealthEventDetail'
import { CreateHealthEventPage, HealthEventsPage } from '../pages/HealthEvents'
import { HealthProfilePage, HealthProfileSectionPage } from '../pages/HealthProfile'
import { LoginPage } from '../pages/Login'
import { ProfileSetupPage } from '../pages/ProfileSetup'
import { AddFamilyMemberPage, EditFamilyMemberPage, FamilyPage } from '../pages/Family'
import { UsageGuidePage } from '../pages/Guide'
import { AccountSettingsPage, NotificationSettingsPage, PrivacySettingsPage, SettingsPage } from '../pages/Settings'
import { MessageCenterPage } from '../pages/Messages'
import { HelpCenterPage } from '../pages/Help'
import { FeedbackPage, FeedbackSubmittedPage } from '../pages/Feedback'
import { AboutPage } from '../pages/About'
import { RequireAuth } from '../components/auth/RequireAuth'

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/onboarding/success', element: <Navigate to="/onboarding/profile" replace /> },
      { path: '/onboarding/profile', element: <ProfileSetupPage /> },
      { path: '/health-events', element: <HealthEventsPage /> },
      { path: '/health-events/new', element: <CreateHealthEventPage /> },
      { path: '/health-events/:eventId', element: <HealthEventDetailPage /> },
      { path: '/health-profile', element: <HealthProfilePage /> },
      { path: '/health-profile/:sectionId', element: <HealthProfileSectionPage /> },
      { path: '/family', element: <FamilyPage /> },
      { path: '/family/new', element: <AddFamilyMemberPage /> },
      { path: '/family/:memberId/edit', element: <EditFamilyMemberPage /> },
      { path: '/guide', element: <UsageGuidePage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/settings/account', element: <AccountSettingsPage /> },
      { path: '/settings/notification', element: <NotificationSettingsPage /> },
      { path: '/settings/privacy', element: <PrivacySettingsPage /> },
      { path: '/messages', element: <MessageCenterPage /> },
      { path: '/help', element: <HelpCenterPage /> },
      { path: '/feedback', element: <FeedbackPage /> },
      { path: '/feedback/submitted', element: <FeedbackSubmittedPage /> },
      { path: '/about', element: <AboutPage /> }
    ]
  },
  { path: '*', element: <Navigate to="/login" replace /> }
])

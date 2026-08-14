import type { ComponentType } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import { RequireAuth } from '../components/auth/RequireAuth'

function lazyPage(load: () => Promise<Record<string, unknown>>, exportName: string) {
  return async () => {
    const module = await load()
    return { Component: module[exportName] as ComponentType }
  }
}

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', lazy: lazyPage(() => import('../pages/Login'), 'LoginPage') },
  {
    element: <RequireAuth />,
    children: [
      { path: '/onboarding/success', element: <Navigate to="/onboarding/profile" replace /> },
      { path: '/onboarding/profile', lazy: lazyPage(() => import('../pages/ProfileSetup'), 'ProfileSetupPage') },
      { path: '/health-events', lazy: lazyPage(() => import('../pages/HealthEvents'), 'HealthEventsPage') },
      { path: '/health-events/new', lazy: lazyPage(() => import('../pages/HealthEvents'), 'CreateHealthEventPage') },
      { path: '/health-events/:eventId', lazy: lazyPage(() => import('../pages/HealthEventDetail'), 'HealthEventDetailPage') },
      { path: '/health-profile', lazy: lazyPage(() => import('../pages/HealthProfile'), 'HealthProfilePage') },
      { path: '/health-profile/:sectionId', lazy: lazyPage(() => import('../pages/HealthProfile/HealthProfileSectionPage'), 'HealthProfileSectionPage') },
      { path: '/family', lazy: lazyPage(() => import('../pages/Family'), 'FamilyPage') },
      { path: '/family/new', lazy: lazyPage(() => import('../pages/Family'), 'AddFamilyMemberPage') },
      { path: '/family/:memberId/edit', lazy: lazyPage(() => import('../pages/Family'), 'EditFamilyMemberPage') },
      { path: '/guide', lazy: lazyPage(() => import('../pages/Guide'), 'UsageGuidePage') },
      { path: '/settings', lazy: lazyPage(() => import('../pages/Settings'), 'SettingsPage') },
      { path: '/settings/account', lazy: lazyPage(() => import('../pages/Settings'), 'AccountSettingsPage') },
      { path: '/settings/notification', lazy: lazyPage(() => import('../pages/Settings'), 'NotificationSettingsPage') },
      { path: '/settings/privacy', lazy: lazyPage(() => import('../pages/Settings'), 'PrivacySettingsPage') },
      { path: '/messages', lazy: lazyPage(() => import('../pages/Messages'), 'MessageCenterPage') },
      { path: '/help', lazy: lazyPage(() => import('../pages/Help'), 'HelpCenterPage') },
      { path: '/feedback', lazy: lazyPage(() => import('../pages/Feedback'), 'FeedbackPage') },
      { path: '/feedback/submitted', lazy: lazyPage(() => import('../pages/Feedback'), 'FeedbackSubmittedPage') },
      { path: '/about', lazy: lazyPage(() => import('../pages/About'), 'AboutPage') }
    ]
  },
  { path: '*', element: <Navigate to="/login" replace /> }
])

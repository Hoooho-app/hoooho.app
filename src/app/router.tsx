import type { ComponentType } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import { RequireAuth } from '../components/auth/RequireAuth'
import { RequireEstablishedHealthData } from '../components/auth/RequireEstablishedHealthData'
import { RequireOpsAuth } from '../components/auth/RequireOpsAuth'

function lazyPage(load: () => Promise<Record<string, unknown>>, exportName: string) {
  return async () => {
    const module = await load()
    return { Component: module[exportName] as ComponentType }
  }
}

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/home" replace /> },
  { path: '/login', lazy: lazyPage(() => import('../pages/Login'), 'LoginPage') },
  { path: '/help', lazy: lazyPage(() => import('../pages/Help'), 'HelpCenterPage') },
  { path: '/ops/login', lazy: lazyPage(() => import('../pages/Ops/Login'), 'OpsLoginPage') },
  {
    element: <RequireOpsAuth />,
    children: [
      { path: '/ops', lazy: lazyPage(() => import('../pages/Ops'), 'OpsPage') },
      { path: '/ops/feedback', lazy: lazyPage(() => import('../pages/Ops/Feedback'), 'OpsFeedbackPage') }
    ]
  },
  {
    element: <RequireAuth />,
    children: [
      { path: '/onboarding/success', element: <Navigate to="/onboarding/profile" replace /> },
      { path: '/onboarding/profile', element: <Navigate to="/children/new" replace /> },
      { path: '/home', lazy: lazyPage(() => import('../pages/Home'), 'HomePage') },
      { path: '/health-events', lazy: lazyPage(() => import('../pages/HealthEvents'), 'HealthEventsPage') },
      { path: '/health-events/new', lazy: lazyPage(() => import('../pages/HealthEvents'), 'CreateHealthEventPage') },
      {
        element: <RequireEstablishedHealthData />,
        children: [
          { path: '/health-events/:eventId', lazy: lazyPage(() => import('../pages/HealthEventDetail'), 'HealthEventDetailPage') },
          { path: '/health-events/:eventId/health-information', lazy: lazyPage(() => import('../pages/HealthEventDetail/HealthInformationCandidatesPage'), 'HealthInformationCandidatesPage') },
          { path: '/health-events/:eventId/online-consultation', element: <Navigate to="/health-tracking" replace /> },
          { path: '/health-tracking/:eventId', lazy: lazyPage(() => import('../pages/HealthTracking'), 'HealthTrackingPage') },
          { path: '/health-tracking/:eventId/growth', lazy: lazyPage(() => import('../pages/GrowthTrend'), 'GrowthTrendPage') },
          { path: '/health-tracking/:eventId/allergy-comparison', lazy: lazyPage(() => import('../pages/AllergyComparison'), 'AllergyComparisonPage') },
          { path: '/visit-preparation/:eventId', lazy: lazyPage(() => import('../pages/VisitPreparation'), 'VisitPreparationPage') },
          { path: '/health-profile', lazy: lazyPage(() => import('../pages/HealthProfile'), 'HealthProfilePage') },
          { path: '/health-profile/facts', lazy: lazyPage(() => import('../pages/HealthProfile/ImportantHealthFactsPage'), 'ImportantHealthFactsPage') },
          { path: '/health-profile/facts/candidates/:candidateId', lazy: lazyPage(() => import('../pages/HealthProfile/HealthProfileFactCandidatePage'), 'HealthProfileFactCandidatePage') },
          { path: '/health-profile/facts/:factId', lazy: lazyPage(() => import('../pages/HealthProfile/HealthProfileFactDetailPage'), 'HealthProfileFactDetailPage') },
          { path: '/health-profile/:sectionId', lazy: lazyPage(() => import('../pages/HealthProfile/HealthProfileSectionPage'), 'HealthProfileSectionPage') }
        ]
      },
      { path: '/health-tracking', lazy: lazyPage(() => import('../pages/HealthTracking'), 'HealthTrackingPage') },
      { path: '/children', lazy: lazyPage(() => import('../pages/Family'), 'FamilyPage') },
      { path: '/children/new', lazy: lazyPage(() => import('../pages/Family'), 'AddFamilyMemberPage') },
      { path: '/children/:memberId/edit', lazy: lazyPage(() => import('../pages/Family'), 'EditFamilyMemberPage') },
      { path: '/family', lazy: lazyPage(() => import('../pages/Family'), 'FamilyPage') },
      { path: '/family/new', lazy: lazyPage(() => import('../pages/Family'), 'AddFamilyMemberPage') },
      { path: '/family/:memberId/edit', lazy: lazyPage(() => import('../pages/Family'), 'EditFamilyMemberPage') },
      { path: '/guide', lazy: lazyPage(() => import('../pages/Guide'), 'UsageGuidePage') },
      { path: '/settings', lazy: lazyPage(() => import('../pages/Settings'), 'SettingsPage') },
      { path: '/settings/personalization', lazy: lazyPage(() => import('../pages/Settings'), 'PersonalizationSettingsPage') },
      { path: '/settings/care', lazy: lazyPage(() => import('../pages/Settings'), 'CareModeSettingsPage') },
      { path: '/settings/account', lazy: lazyPage(() => import('../pages/Settings'), 'AccountSettingsPage') },
      { path: '/settings/notification', element: <Navigate to="/settings" replace /> },
      { path: '/settings/privacy', lazy: lazyPage(() => import('../pages/Settings'), 'PrivacySettingsPage') },
      { path: '/messages/*', element: <Navigate to="/home" replace /> },
      { path: '/message/*', element: <Navigate to="/home" replace /> },
      { path: '/notifications/*', element: <Navigate to="/home" replace /> },
      { path: '/notification/*', element: <Navigate to="/home" replace /> },
      { path: '/feedback', lazy: lazyPage(() => import('../pages/Feedback'), 'FeedbackPage') },
      { path: '/feedback/submitted', lazy: lazyPage(() => import('../pages/Feedback'), 'FeedbackSubmittedPage') },
      { path: '/feedback/mine', lazy: lazyPage(() => import('../pages/Feedback'), 'MyFeedbackPage') },
      { path: '/feedback/:feedbackId', lazy: lazyPage(() => import('../pages/Feedback'), 'FeedbackDetailPage') },
      { path: '/about', lazy: lazyPage(() => import('../pages/About'), 'AboutPage') }
    ]
  },
  { path: '*', lazy: lazyPage(() => import('../pages/NotFound'), 'NotFoundPage') }
])

import type { ComponentType } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import { installChildBodyHistory } from '../features/body-location/childBodyHistory'
import { RequireAuth } from '../components/auth/RequireAuth'
import { RequireEstablishedHealthData } from '../components/auth/RequireEstablishedHealthData'
import { RequireOpsAuth } from '../components/auth/RequireOpsAuth'
import { RequireRegisteredAccount } from '../components/auth/RequireRegisteredAccount'
import { ProfileSectionGate } from '../components/auth/SessionRecoveryView'

function lazyPage(load: () => Promise<Record<string, unknown>>, exportName: string, archive = false) {
  return async () => {
    const module = await load()
    const Page = module[exportName] as ComponentType
    return { Component: archive ? () => <ProfileSectionGate><Page /></ProfileSectionGate> : Page }
  }
}

installChildBodyHistory()
export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/nurse-station" replace /> },
  { path: '/login', lazy: lazyPage(() => import('../pages/Login'), 'LoginPage') },
  { path: '/help', lazy: lazyPage(() => import('../pages/Help'), 'HelpCenterPage') },
  { path: '/medical-preparation/:shareToken', lazy: lazyPage(() => import('../pages/MedicalPreparationShared'), 'MedicalPreparationSharedPage') },
  { path: '/care-handoff/shared/:shareToken', lazy: lazyPage(() => import('../pages/CareHandoff'), 'CareHandoffSharedPage') },
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
      { path: '/onboarding/profile', lazy: lazyPage(() => import('../pages/ProfileSetup'), 'ProfileSetupPage') },
      { path: '/health-calendar', lazy: lazyPage(() => import('../pages/HealthCalendar'), 'HealthCalendarPage') },
      { path: '/care-handoff', lazy: lazyPage(() => import('../pages/CareHandoff'), 'CareHandoffPage') },
      { path: '/recent-review', lazy: lazyPage(() => import('../pages/RecentReview'), 'RecentReviewPage') },
      { path: '/nurse-station', lazy: lazyPage(() => import('../pages/NurseStation'), 'NurseStationPage') },
      { path: '/conversation-history', lazy: lazyPage(() => import('../pages/NurseStation/ConversationHistoryPage'), 'ConversationHistoryPage') },
      { path: '/conversation-history/:contextId', lazy: lazyPage(() => import('../pages/NurseStation/ConversationHistoryPage'), 'ConversationHistoryPage') },
      { path: '/care-journey', lazy: lazyPage(() => import('../features/care-journey/CareJourneyPages'), 'CareJourneyPage') },
      { path: '/care-journey/sprouts', lazy: lazyPage(() => import('../features/care-journey/CareJourneyPages'), 'CareSproutsPage') },
      { path: '/care-journey/exchange', lazy: lazyPage(() => import('../features/care-journey/CareJourneyPages'), 'CareExchangePage') },
      { path: '/care-journey/growth', lazy: lazyPage(() => import('../features/care-journey/CareJourneyPages'), 'CareGrowthPage') },
      { path: '/care-journey/achievements', lazy: lazyPage(() => import('../features/care-journey/CareJourneyPages'), 'CareAchievementsPage') },
      { path: '/care-journey/themes', lazy: lazyPage(() => import('../features/care-journey/CareJourneyPages'), 'CareThemePage') },
      { path: '/family-sharing', lazy: lazyPage(() => import('../features/family-sharing/FamilySharingPage'), 'FamilySharingPage') },
      { path: '/health-profile/vaccination/plan', lazy: lazyPage(() => import('../features/vaccine-plan/VaccinePlanPage'), 'VaccinePlanPage') },
      { path: '/allergy-knowledge', lazy: lazyPage(() => import('../pages/AllergyKnowledge'), 'AllergyKnowledgePage') },
      { path: '/allergy-knowledge/:articleId', lazy: lazyPage(() => import('../pages/AllergyKnowledge'), 'AllergyKnowledgePage') },
      { path: '/food-observations', lazy: lazyPage(() => import('../features/food-observations/FoodObservationsPage'), 'FoodObservationsPage') },
      { path: '/food-label', lazy: lazyPage(() => import('../pages/FoodLabel'), 'FoodLabelPage') },
      { path: '/care-tools/food-comparison', lazy: lazyPage(() => import('../features/care-tools'), 'FoodComparisonPage') },
      { path: '/care-tools/handoff', lazy: lazyPage(() => import('../features/care-tools'), 'DietaryHandoffPage') },
      { path: '/care-tools/medication-templates', lazy: lazyPage(() => import('../features/care-tools'), 'MedicationTemplatesPage') },
      { path: '/care-tools/results', lazy: lazyPage(() => import('../features/care-tools'), 'CareToolResultsPage') },
      { path: '/food-allergy-status-index', lazy: lazyPage(() => import('../features/case-continuity/Pages'), 'RetiredIndexPage') },
      { path: '/smart-record', lazy: lazyPage(() => import('../features/case-continuity/Pages'), 'SmartCaseRecordPage') },
      { path: '/cases', lazy: lazyPage(() => import('../features/case-continuity/Pages'), 'CaseListPage') },
      { path: '/cases/compare', lazy: lazyPage(() => import('../features/case-continuity/Pages'), 'CaseComparePage') },
      { path: '/cases/:eventId/observation', lazy: lazyPage(() => import('../features/case-continuity/Pages'), 'ObservationPlanPage') },
      { path: '/cases/:eventId/materials', lazy: lazyPage(() => import('../features/case-continuity/MaterialReturnPage'), 'MaterialReturnPage') },
      { path: '/medication-reminders', lazy: lazyPage(() => import('../pages/NurseStation/GuardianTaskListPage'), 'MedicationReminderListPage') },
      { path: '/desensitization-tests', lazy: lazyPage(() => import('../pages/NurseStation/GuardianTaskListPage'), 'DesensitizationTestListPage') },
      { path: '/nurse-station/desensitization/new', lazy: lazyPage(() => import('../pages/NurseStation/DesensitizationTestNewPage'), 'DesensitizationTestNewPage') },
      { path: '/visit-summary/:eventId', lazy: lazyPage(() => import('../pages/VisitSummary'), 'VisitSummaryPage') },
      { path: '/visit-summary', lazy: lazyPage(() => import('../pages/VisitSummary'), 'VisitSummaryPage') },
      { path: '/health-events', lazy: lazyPage(() => import('../pages/HealthEvents'), 'HealthEventsPage') },
      { path: '/quick-search', lazy: lazyPage(() => import('../pages/NurseStation/RecordFinder'), 'QuickSearchPage') },
      { path: '/health-events/search', lazy: lazyPage(() => import('../pages/HealthEvents/JournalSearchPage'), 'JournalSearchPage') },
      { path: '/health-events/new', lazy: lazyPage(() => import('../pages/HealthEvents'), 'CreateHealthEventPage') },
      {
        element: <RequireEstablishedHealthData />,
        children: [
          { path: '/health-events/:eventId', lazy: lazyPage(() => import('../features/case-continuity/Pages'), 'LegacyCaseRedirectPage') },
          { path: '/health-events/:eventId/health-information', lazy: lazyPage(() => import('../pages/HealthEventDetail/HealthInformationCandidatesPage'), 'HealthInformationCandidatesPage') },
          { path: '/health-events/:eventId/online-consultation', lazy: lazyPage(() => import('../pages/OnlineConsultation'), 'OnlineConsultationPage') }
        ]
      },
      {
        element: <RequireEstablishedHealthData requireHealthRecord={false} />,
        children: [
          { path: '/dietary-card', lazy: lazyPage(() => import('../pages/DietaryCard'), 'DietaryCardPage', true) },
          { path: '/dietary-card/edit', lazy: lazyPage(() => import('../pages/DietaryCard'), 'DietaryCardEditPage', true) },
          { path: '/health-profile', lazy: lazyPage(() => import('../pages/HealthProfile'), 'HealthProfilePage') },
          { path: '/health-profile/smart-record', lazy: lazyPage(() => import('../pages/HealthProfile/SmartRecordPage'), 'SmartRecordPage', true) },
          { path: '/health-profile/identity', lazy: lazyPage(() => import('../pages/HealthProfile/ChildIdentityPage'), 'ChildIdentityPage', true) },
          { path: '/health-profile/checkups', lazy: lazyPage(() => import('../pages/HealthProfile/ChildCheckupsPage'), 'ChildCheckupsPage', true) },
          { path: '/health-profile/vaccination', lazy: lazyPage(() => import('../pages/HealthProfile/VaccinationRecordsPage'), 'VaccinationRecordsPage', true) },
          { path: '/health-profile/allergy', lazy: lazyPage(() => import('../pages/HealthProfile/InlineChildProfilePage'), 'InlineChildProfilePage') },
          { path: '/health-profile/chronic', lazy: lazyPage(() => import('../pages/HealthProfile/InlineChildProfilePage'), 'InlineChildProfilePage') },
          { path: '/health-profile/family-history', lazy: lazyPage(() => import('../pages/HealthProfile/InlineChildProfilePage'), 'InlineChildProfilePage') },
          { path: '/health-profile/surgery', lazy: lazyPage(() => import('../pages/HealthProfile/InlineChildProfilePage'), 'InlineChildProfilePage') },
          { path: '/health-profile/legacy/:sectionId', lazy: lazyPage(() => import('../pages/HealthProfile/HealthProfileSectionPage'), 'HealthProfileSectionPage', true) },
          { path: '/health-profile/growth', lazy: lazyPage(() => import('../pages/HealthProfile/GrowthRecordsPage'), 'GrowthRecordsPage') },
          { path: '/health-profile/growth/reassurance', lazy: lazyPage(() => import('../pages/HealthProfile/GrowthReassurancePage'), 'GrowthReassurancePage') },
          { path: '/health-profile/facts', lazy: lazyPage(() => import('../pages/HealthProfile/ImportantHealthFactsPage'), 'ImportantHealthFactsPage') },
          { path: '/health-profile/facts/candidates/:candidateId', lazy: lazyPage(() => import('../pages/HealthProfile/HealthProfileFactCandidatePage'), 'HealthProfileFactCandidatePage') },
          { path: '/health-profile/facts/:factId', lazy: lazyPage(() => import('../pages/HealthProfile/HealthProfileFactDetailPage'), 'HealthProfileFactDetailPage') },
          { path: '/health-profile/allergy/*', lazy: lazyPage(() => import('../pages/HealthProfile/AllergyProfilePage'), 'AllergyHistoryPage', true) },
          { path: '/health-profile/:sectionId', lazy: lazyPage(() => import('../pages/HealthProfile/HealthProfileSectionPage'), 'HealthProfileSectionPage', true) }
        ]
      },
      { path: '/family', element: <Navigate to="/nurse-station" replace /> },
      { path: '/family/new', lazy: lazyPage(() => import('../pages/Family'), 'AddFamilyMemberPage') },
      { path: '/family/:memberId/edit', lazy: lazyPage(() => import('../pages/Family'), 'EditFamilyMemberPage') },
      { path: '/guide', lazy: lazyPage(() => import('../pages/Guide'), 'UsageGuidePage') },
      { path: '/settings', lazy: lazyPage(() => import('../pages/Settings'), 'SettingsPage') },
      { path: '/settings/personalization', lazy: lazyPage(() => import('../pages/Settings'), 'PersonalizationSettingsPage') },
      { path: '/settings/care', lazy: lazyPage(() => import('../pages/Settings'), 'CareModeSettingsPage') },
      { path: '/settings/account', lazy: lazyPage(() => import('../pages/Settings'), 'AccountSettingsPage') },
      { path: '/settings/notification', element: <Navigate to="/settings" replace /> },
      { path: '/settings/privacy', lazy: lazyPage(() => import('../pages/Settings'), 'PrivacySettingsPage') },
      {
        element: <RequireRegisteredAccount />,
        children: [
          { path: '/account/security', lazy: lazyPage(() => import('../pages/Account'), 'AccountSecurityPage') },
          { path: '/account/password', lazy: lazyPage(() => import('../pages/Account'), 'AccountPasswordPage') },
          { path: '/account/avatar', lazy: lazyPage(() => import('../pages/Account'), 'AccountAvatarPage') },
          { path: '/account/nickname', lazy: lazyPage(() => import('../pages/Account'), 'AccountNicknamePage') },
          { path: '/account/phone', lazy: lazyPage(() => import('../pages/Account'), 'AccountPhonePage') },
          { path: '/account/email', lazy: lazyPage(() => import('../pages/Account'), 'AccountEmailPage') },
          { path: '/account/providers', lazy: lazyPage(() => import('../pages/Account'), 'AccountProvidersPage') },
          { path: '/account/membership', lazy: lazyPage(() => import('../pages/Account'), 'AccountMembershipPage') },
          { path: '/account/delete', lazy: lazyPage(() => import('../pages/Account'), 'AccountDeletePage') }
        ]
      },
      { path: '/messages/*', element: <Navigate to="/health-events" replace /> },
      { path: '/message/*', element: <Navigate to="/health-events" replace /> },
      { path: '/notifications/*', element: <Navigate to="/health-events" replace /> },
      { path: '/notification/*', element: <Navigate to="/health-events" replace /> },
      { path: '/feedback', lazy: lazyPage(() => import('../pages/Feedback'), 'FeedbackPage') },
      { path: '/feedback/submitted', lazy: lazyPage(() => import('../pages/Feedback'), 'FeedbackSubmittedPage') },
      { path: '/feedback/mine', lazy: lazyPage(() => import('../pages/Feedback'), 'MyFeedbackPage') },
      { path: '/feedback/:feedbackId', lazy: lazyPage(() => import('../pages/Feedback'), 'FeedbackDetailPage') },
      { path: '/about', lazy: lazyPage(() => import('../pages/About'), 'AboutPage') }
    ]
  },
  { path: '*', lazy: lazyPage(() => import('../pages/NotFound'), 'NotFoundPage') }
])

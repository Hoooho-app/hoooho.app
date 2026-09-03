# Static interaction inventory seed

Generated: 2026-09-03T04:49:42.120Z

Application root: `D:/projects/hoooho/.worktrees/global-design-quality-20260903`

> This is a static seed. Runtime browser verification is required before marking any interaction PASS.

## Routes

| Route | Definition file | Runtime status | Evidence |
| --- | --- | --- | --- |
| / | `src/app/router.tsx` | NOT_RUN | |
| /login | `src/app/router.tsx` | NOT_RUN | |
| /help | `src/app/router.tsx` | NOT_RUN | |
| /ops/login | `src/app/router.tsx` | NOT_RUN | |
| /ops | `src/app/router.tsx` | NOT_RUN | |
| /ops/feedback | `src/app/router.tsx` | NOT_RUN | |
| /onboarding/success | `src/app/router.tsx` | NOT_RUN | |
| /onboarding/profile | `src/app/router.tsx` | NOT_RUN | |
| /health-events | `src/app/router.tsx` | NOT_RUN | |
| /health-events/new | `src/app/router.tsx` | NOT_RUN | |
| /health-events/:eventId | `src/app/router.tsx` | NOT_RUN | |
| /health-events/:eventId/health-information | `src/app/router.tsx` | NOT_RUN | |
| /health-events/:eventId/online-consultation | `src/app/router.tsx` | NOT_RUN | |
| /health-profile | `src/app/router.tsx` | NOT_RUN | |
| /health-profile/facts | `src/app/router.tsx` | NOT_RUN | |
| /health-profile/facts/candidates/:candidateId | `src/app/router.tsx` | NOT_RUN | |
| /health-profile/facts/:factId | `src/app/router.tsx` | NOT_RUN | |
| /health-profile/:sectionId | `src/app/router.tsx` | NOT_RUN | |
| /family | `src/app/router.tsx` | NOT_RUN | |
| /family/new | `src/app/router.tsx` | NOT_RUN | |
| /family/:memberId/edit | `src/app/router.tsx` | NOT_RUN | |
| /guide | `src/app/router.tsx` | NOT_RUN | |
| /settings | `src/app/router.tsx` | NOT_RUN | |
| /settings/personalization | `src/app/router.tsx` | NOT_RUN | |
| /settings/care | `src/app/router.tsx` | NOT_RUN | |
| /settings/account | `src/app/router.tsx` | NOT_RUN | |
| /settings/notification | `src/app/router.tsx` | NOT_RUN | |
| /settings/privacy | `src/app/router.tsx` | NOT_RUN | |
| /messages/* | `src/app/router.tsx` | NOT_RUN | |
| /message/* | `src/app/router.tsx` | NOT_RUN | |
| /notifications/* | `src/app/router.tsx` | NOT_RUN | |
| /notification/* | `src/app/router.tsx` | NOT_RUN | |
| /feedback | `src/app/router.tsx` | NOT_RUN | |
| /feedback/submitted | `src/app/router.tsx` | NOT_RUN | |
| /feedback/mine | `src/app/router.tsx` | NOT_RUN | |
| /feedback/:feedbackId | `src/app/router.tsx` | NOT_RUN | |
| /about | `src/app/router.tsx` | NOT_RUN | |
| * | `src/app/router.tsx` | NOT_RUN | |

## Files with interaction signals

| File | Signals | Count | Runtime status |
| --- | --- | ---: | --- |
| `src/components/auth/OpsAccount.tsx` | buttons:1, click_handlers:1 | 2 | NOT_RUN |
| `src/components/auth/RequireEstablishedHealthData.tsx` | click_handlers:1 | 1 | NOT_RUN |
| `src/components/auth/RequireOpsAuth.tsx` | links:1, click_handlers:3 | 4 | NOT_RUN |
| `src/components/common/Header.tsx` | buttons:1, click_handlers:1 | 2 | NOT_RUN |
| `src/components/common/WebPageHeader.tsx` | buttons:1, click_handlers:1 | 2 | NOT_RUN |
| `src/components/design-system/BottomSheetSurface.tsx` | buttons:2, click_handlers:2 | 4 | NOT_RUN |
| `src/components/design-system/ConfirmDialog.tsx` | buttons:1, click_handlers:3 | 4 | NOT_RUN |
| `src/components/design-system/HohoButton.tsx` | buttons:1 | 1 | NOT_RUN |
| `src/components/design-system/HohoInput.tsx` | inputs:1 | 1 | NOT_RUN |
| `src/components/design-system/HohoSurfaceRow.tsx` | buttons:1, click_handlers:1 | 2 | NOT_RUN |
| `src/components/design-system/HohoToggle.tsx` | buttons:1, click_handlers:1 | 2 | NOT_RUN |
| `src/components/family/FamilyAvatarEditor.tsx` | buttons:3, inputs:2, click_handlers:5 | 10 | NOT_RUN |
| `src/components/family/FamilyEditorConfirmDialog.tsx` | overlays:1 | 1 | NOT_RUN |
| `src/components/health/body-location/BodyLocationAtlas.tsx` | click_handlers:1, keyboard_handlers:1, button_roles:1 | 3 | NOT_RUN |
| `src/components/health/BodyLocationPicker.tsx` | buttons:7, inputs:1, click_handlers:8 | 16 | NOT_RUN |
| `src/components/health/HealthEventCard.tsx` | buttons:3, click_handlers:3, overlays:1 | 7 | NOT_RUN |
| `src/components/health/HealthEventFilterSheet.tsx` | buttons:7, inputs:3, click_handlers:12 | 22 | NOT_RUN |
| `src/components/health/QuickRecordTrigger.tsx` | buttons:1, click_handlers:1 | 2 | NOT_RUN |
| `src/components/health/RecordSubjectCard.tsx` | buttons:1, click_handlers:1 | 2 | NOT_RUN |
| `src/components/health/SmartTagInput.tsx` | buttons:3, inputs:1, click_handlers:3, keyboard_handlers:1 | 8 | NOT_RUN |
| `src/components/navigation/MainAppHeader.tsx` | buttons:1, click_handlers:1, overlays:2 | 4 | NOT_RUN |
| `src/components/navigation/SideDrawer.tsx` | buttons:7, click_handlers:7 | 14 | NOT_RUN |
| `src/pages/About/index.tsx` | buttons:1, links:1 | 2 | NOT_RUN |
| `src/pages/Family/EditFamilyMemberPage.tsx` | buttons:4, inputs:2, forms:1, click_handlers:3, submit_handlers:1, overlays:2 | 13 | NOT_RUN |
| `src/pages/Family/index.tsx` | buttons:3, inputs:3, forms:1, click_handlers:2, submit_handlers:1 | 10 | NOT_RUN |
| `src/pages/Feedback/FeedbackComposer.tsx` | buttons:3, inputs:2, click_handlers:3 | 8 | NOT_RUN |
| `src/pages/Feedback/index.tsx` | buttons:6, links:1, forms:1, click_handlers:5, submit_handlers:1 | 14 | NOT_RUN |
| `src/pages/Feedback/MyFeedbackCard.tsx` | buttons:4, links:1, click_handlers:4 | 9 | NOT_RUN |
| `src/pages/Guide/index.tsx` | buttons:6, inputs:1, click_handlers:6, overlays:1 | 14 | NOT_RUN |
| `src/pages/Guide/TutorialDetailSheet.tsx` | buttons:2, click_handlers:3 | 5 | NOT_RUN |
| `src/pages/Guide/TutorialMedia.tsx` | buttons:2, click_handlers:2, media:1 | 5 | NOT_RUN |
| `src/pages/HealthEventDetail/components/ActionSheet.tsx` | buttons:6, click_handlers:12 | 18 | NOT_RUN |
| `src/pages/HealthEventDetail/components/AskAIWorkspace.tsx` | buttons:7, inputs:1, click_handlers:10 | 18 | NOT_RUN |
| `src/pages/HealthEventDetail/components/ComingSoonPrompt.tsx` | click_handlers:1 | 1 | NOT_RUN |
| `src/pages/HealthEventDetail/components/EventDetailStickyHeader.tsx` | click_handlers:1 | 1 | NOT_RUN |
| `src/pages/HealthEventDetail/components/EventHeader.tsx` | buttons:2, click_handlers:2 | 4 | NOT_RUN |
| `src/pages/HealthEventDetail/components/EventIdentitySection.tsx` | click_handlers:1 | 1 | NOT_RUN |
| `src/pages/HealthEventDetail/components/EventStatus.tsx` | buttons:3, click_handlers:5 | 8 | NOT_RUN |
| `src/pages/HealthEventDetail/components/EventTitleSection.tsx` | buttons:3, inputs:1, forms:1, click_handlers:2, submit_handlers:1 | 8 | NOT_RUN |
| `src/pages/HealthEventDetail/components/FirstRecordComposer.tsx` | buttons:3, inputs:3, click_handlers:4 | 10 | NOT_RUN |
| `src/pages/HealthEventDetail/components/HealthChangeAnnotationSheet.tsx` | buttons:1, click_handlers:2 | 3 | NOT_RUN |
| `src/pages/HealthEventDetail/components/HealthInformationDiscoveryCard.tsx` | buttons:1, click_handlers:1 | 2 | NOT_RUN |
| `src/pages/HealthEventDetail/components/HealthRecordEditorModal.tsx` | buttons:11, inputs:6, click_handlers:9 | 26 | NOT_RUN |
| `src/pages/HealthEventDetail/components/MedicalInfoSection.tsx` | buttons:2, click_handlers:1 | 3 | NOT_RUN |
| `src/pages/HealthEventDetail/components/NextActionSection.tsx` | buttons:2, click_handlers:2 | 4 | NOT_RUN |
| `src/pages/HealthEventDetail/components/QuickRecordPhotos.tsx` | buttons:7, inputs:1, click_handlers:7 | 15 | NOT_RUN |
| `src/pages/HealthEventDetail/components/QuickVoiceRecordFlow.tsx` | buttons:9, inputs:2, click_handlers:19 | 30 | NOT_RUN |
| `src/pages/HealthEventDetail/components/SymptomRecordSheet.tsx` | inputs:5, click_handlers:5 | 10 | NOT_RUN |
| `src/pages/HealthEventDetail/components/SymptomSection.tsx` | buttons:2, click_handlers:3, keyboard_handlers:1, button_roles:1, overlays:2 | 9 | NOT_RUN |
| `src/pages/HealthEventDetail/components/TemperatureChartSection.tsx` | buttons:1, click_handlers:2, keyboard_handlers:1, button_roles:1 | 5 | NOT_RUN |
| `src/pages/HealthEventDetail/components/TimelineSection.tsx` | buttons:4, click_handlers:5, overlays:2 | 11 | NOT_RUN |
| `src/pages/HealthEventDetail/HealthInformationCandidatesPage.tsx` | inputs:2, click_handlers:3 | 5 | NOT_RUN |
| `src/pages/HealthEventDetail/index.tsx` | buttons:2, click_handlers:3, overlays:1 | 6 | NOT_RUN |
| `src/pages/HealthEvents/FirstMemberFrontDesk.tsx` | buttons:1, click_handlers:2 | 3 | NOT_RUN |
| `src/pages/HealthEvents/IdleNurseVisual.tsx` | media:2 | 2 | NOT_RUN |
| `src/pages/HealthEvents/index.tsx` | buttons:5, click_handlers:8, overlays:1 | 14 | NOT_RUN |
| `src/pages/HealthEvents/NurseNextAction.tsx` | buttons:6, click_handlers:12, overlays:3 | 21 | NOT_RUN |
| `src/pages/HealthEvents/NurseQuickRecord.tsx` | buttons:1, click_handlers:2 | 3 | NOT_RUN |
| `src/pages/HealthProfile/AllergyProfilePage.tsx` | buttons:6, inputs:4, forms:1, click_handlers:7, submit_handlers:1 | 19 | NOT_RUN |
| `src/pages/HealthProfile/ChronicProfilePage.tsx` | buttons:5, inputs:3, forms:1, click_handlers:6, submit_handlers:1 | 16 | NOT_RUN |
| `src/pages/HealthProfile/FamilyHistoryProfilePage.tsx` | buttons:3, inputs:3, forms:1, click_handlers:4, submit_handlers:1 | 12 | NOT_RUN |
| `src/pages/HealthProfile/HealthProfileFactCandidatePage.tsx` | buttons:1, inputs:5, forms:1, click_handlers:1, submit_handlers:1 | 9 | NOT_RUN |
| `src/pages/HealthProfile/HealthProfileFactDetailPage.tsx` | buttons:1, inputs:5, forms:1, click_handlers:3, submit_handlers:1 | 11 | NOT_RUN |
| `src/pages/HealthProfile/HealthProfileSectionPage.tsx` | buttons:4, inputs:5, forms:1, click_handlers:5, submit_handlers:1 | 16 | NOT_RUN |
| `src/pages/HealthProfile/ImportantHealthFactsPage.tsx` | buttons:3, click_handlers:4 | 7 | NOT_RUN |
| `src/pages/HealthProfile/index.tsx` | buttons:3, inputs:2, click_handlers:3 | 8 | NOT_RUN |
| `src/pages/HealthProfile/MedicationProfilePage.tsx` | buttons:5, inputs:8, forms:1, click_handlers:6, submit_handlers:1 | 21 | NOT_RUN |
| `src/pages/HealthProfile/profile-sections/HealthProfileExperiencePage.tsx` | inputs:2, forms:1, click_handlers:2, submit_handlers:1 | 6 | NOT_RUN |
| `src/pages/HealthProfile/profile-sections/ProfileSectionPatterns.tsx` | buttons:9, inputs:1, click_handlers:10, keyboard_handlers:1 | 21 | NOT_RUN |
| `src/pages/HealthProfile/SurgeryProfilePage.tsx` | buttons:4, inputs:3, forms:1, click_handlers:5, submit_handlers:1 | 14 | NOT_RUN |
| `src/pages/Help/index.tsx` | buttons:13, inputs:1, forms:1, click_handlers:13, submit_handlers:1, keyboard_handlers:1 | 30 | NOT_RUN |
| `src/pages/Login/index.tsx` | buttons:3, inputs:2, forms:1, click_handlers:2, submit_handlers:1, media:1 | 10 | NOT_RUN |
| `src/pages/NotFound/index.tsx` | click_handlers:2 | 2 | NOT_RUN |
| `src/pages/OnlineConsultation/index.tsx` | buttons:7, inputs:3, click_handlers:20 | 30 | NOT_RUN |
| `src/pages/Ops/Feedback.tsx` | buttons:17, links:1, inputs:16, forms:1, click_handlers:22, submit_handlers:1, keyboard_handlers:1 | 59 | NOT_RUN |
| `src/pages/Ops/index.tsx` | buttons:10, links:1, inputs:19, forms:3, click_handlers:13, submit_handlers:5, overlays:7 | 58 | NOT_RUN |
| `src/pages/Ops/Login.tsx` | buttons:1, inputs:2, forms:1, click_handlers:1, submit_handlers:1 | 6 | NOT_RUN |
| `src/pages/ProfileSetup/index.tsx` | buttons:3, inputs:4, forms:1, click_handlers:2, submit_handlers:1 | 11 | NOT_RUN |
| `src/pages/Settings/index.tsx` | buttons:4, click_handlers:6, overlays:1 | 11 | NOT_RUN |

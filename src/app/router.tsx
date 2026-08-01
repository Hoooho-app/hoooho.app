import { Navigate, createBrowserRouter } from 'react-router-dom'
import { HealthEventDetailPage } from '../pages/HealthEventDetail'
import { CreateHealthEventPage, HealthEventsPage } from '../pages/HealthEvents'
import { HealthProfilePage } from '../pages/HealthProfile'
import { MyPage } from '../pages/My'

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/health-events" replace /> },
  { path: '/health-events', element: <HealthEventsPage /> },
  { path: '/health-events/new', element: <CreateHealthEventPage /> },
  { path: '/health-events/:eventId', element: <HealthEventDetailPage /> },
  { path: '/health-profile', element: <HealthProfilePage /> },
  { path: '/my', element: <MyPage /> },
  { path: '*', element: <Navigate to="/health-events" replace /> }
])

import { createRouter, createWebHistory, type Router, type RouterHistory } from 'vue-router'
import type { Pinia } from 'pinia'
import { setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { isAdminUiV2Enabled } from '@/config/feature-flags'

type RouterOptions = {
  adminUiV2?: boolean
  history?: RouterHistory
  stubComponents?: boolean
}

const LoginView = () => import('@/views/Login.vue')
const SignupView = () => import('@/views/Signup.vue')
const AdminHome = () => import('@/views/admin/AdminHome.vue')
const AdminTournament = () => import('@/views/admin/AdminTournament.vue')
const AdminTournamentHome = () => import('@/views/admin/AdminTournamentHome.vue')
const AdminTournamentRounds = () => import('@/views/admin/AdminTournamentRounds.vue')
const AdminTournamentSubmissions = () => import('@/views/admin/AdminTournamentSubmissions.vue')
const AdminTournamentCompiled = () => import('@/views/admin/AdminTournamentCompiled.vue')
const AdminRoundOperationsHub = () => import('@/views/admin/AdminRoundOperationsHub.vue')
const AdminRoundIndex = () => import('@/views/admin/round/AdminRoundIndex.vue')
const AdminRoundAllocation = () => import('@/views/admin/round/AdminRoundAllocation.vue')
const AdminRoundResult = () => import('@/views/admin/round/AdminRoundResult.vue')
const UserHome = () => import('@/views/user/UserHome.vue')
const UserTournament = () => import('@/views/user/UserTournament.vue')
const UserTournamentHome = () => import('@/views/user/UserTournamentHome.vue')
const UserTournamentResults = () => import('@/views/user/UserTournamentResults.vue')
const UserParticipantLayout = () => import('@/views/user/participant/UserParticipantLayout.vue')
const UserParticipantHome = () => import('@/views/user/participant/UserParticipantHome.vue')
const UserParticipantRoundLayout = () => import('@/views/user/participant/round/UserParticipantRoundLayout.vue')
const UserRoundHome = () => import('@/views/user/participant/round/UserRoundHome.vue')
const UserRoundBallot = () => import('@/views/user/participant/round/UserRoundBallot.vue')
const UserRoundFeedback = () => import('@/views/user/participant/round/UserRoundFeedback.vue')
const UserRoundBallotHome = () => import('@/views/user/participant/round/ballot/UserRoundBallotHome.vue')
const UserRoundBallotEntry = () => import('@/views/user/participant/round/ballot/UserRoundBallotEntry.vue')
const UserRoundFeedbackHome = () => import('@/views/user/participant/round/feedback/UserRoundFeedbackHome.vue')
const UserRoundFeedbackEntry = () => import('@/views/user/participant/round/feedback/UserRoundFeedbackEntry.vue')
const StubRouteComponent = { template: '<div />' }

export function createAppRouter(options: RouterOptions = {}): Router {
  const adminUiV2 = options.adminUiV2 ?? isAdminUiV2Enabled()
  const useStubComponents = options.stubComponents ?? false
  const routeComponent = (component: unknown) =>
    (useStubComponents ? StubRouteComponent : component) as any
  const redirectToOperationsSubmissions = (to: any) => ({
    path: `/admin/${String(to.params.tournamentId ?? '')}/operations`,
    query: {
      ...to.query,
      task: 'submissions',
    },
  })
  const adminChildren = adminUiV2
    ? [
        {
          path: '',
          redirect: (to: any) => ({
            path: `/admin/${String(to.params.tournamentId ?? '')}/setup`,
            query: to.query,
          }),
        },
        { path: 'setup', component: routeComponent(AdminTournamentHome) },
        {
          path: 'home',
          redirect: (to: any) => ({
            path: `/admin/${String(to.params.tournamentId ?? '')}/setup`,
            query: to.query,
          }),
        },
        { path: 'operations', component: routeComponent(AdminRoundOperationsHub) },
        {
          path: 'rounds',
          redirect: (to: any) => ({
            path: `/admin/${String(to.params.tournamentId ?? '')}/operations`,
            query: to.query,
          }),
        },
        { path: 'submissions', redirect: redirectToOperationsSubmissions },
        { path: 'reports', component: routeComponent(AdminTournamentCompiled) },
        {
          path: 'reports/presentation',
          redirect: (to: any) => ({
            path: `/admin/${String(to.params.tournamentId ?? '')}/reports`,
            query: to.query,
          }),
        },
        {
          path: 'compiled',
          redirect: (to: any) => ({
            path: `/admin/${String(to.params.tournamentId ?? '')}/reports`,
            query: to.query,
          }),
        },
        {
          path: 'compiled/presentation',
          redirect: (to: any) => ({
            path: `/admin/${String(to.params.tournamentId ?? '')}/reports`,
            query: to.query,
          }),
        },
      ]
    : [
        {
          path: '',
          redirect: (to: any) => ({
            path: `/admin/${String(to.params.tournamentId ?? '')}/home`,
            query: to.query,
          }),
        },
        { path: 'home', component: routeComponent(AdminTournamentHome) },
        { path: 'setup', component: routeComponent(AdminTournamentHome) },
        { path: 'rounds', component: routeComponent(AdminRoundOperationsHub) },
        { path: 'operations', component: routeComponent(AdminRoundOperationsHub) },
        { path: 'submissions', redirect: redirectToOperationsSubmissions },
        { path: 'compiled', component: routeComponent(AdminTournamentCompiled) },
        { path: 'reports', component: routeComponent(AdminTournamentCompiled) },
        {
          path: 'compiled/presentation',
          redirect: (to: any) => ({
            path: `/admin/${String(to.params.tournamentId ?? '')}/compiled`,
            query: to.query,
          }),
        },
        {
          path: 'reports/presentation',
          redirect: (to: any) => ({
            path: `/admin/${String(to.params.tournamentId ?? '')}/reports`,
            query: to.query,
          }),
        },
      ]
  return createRouter({
    history: options.history ?? createWebHistory(),
    routes: [
      { path: '/', redirect: '/user' },
      { path: '/login', component: routeComponent(LoginView) },
      { path: '/signup', component: routeComponent(SignupView) },
      { path: '/admin', component: routeComponent(AdminHome), meta: { requiresAuth: true } },
      {
        path: '/admin-embed/:tournamentId/rounds/:round/allocation',
        component: routeComponent(AdminRoundAllocation),
        meta: { requiresAuth: true },
      },
      {
        path: '/admin-embed/:tournamentId/submissions',
        component: routeComponent(AdminTournamentSubmissions),
        meta: { requiresAuth: true },
      },
      {
        path: '/admin-embed/:tournamentId/reports',
        component: routeComponent(AdminTournamentCompiled),
        meta: { requiresAuth: true },
      },
      {
        path: '/admin-embed/:tournamentId/reports/presentation',
        redirect: (to: any) => ({
          path: `/admin-embed/${String(to.params.tournamentId ?? '')}/reports`,
          query: to.query,
        }),
        meta: { requiresAuth: true },
      },
      {
        path: '/admin-embed/:tournamentId/rounds/settings',
        component: routeComponent(AdminTournamentRounds),
        meta: { requiresAuth: true },
      },
      {
        path: '/admin-embed/:tournamentId/rounds/:round/result',
        component: routeComponent(AdminRoundResult),
        meta: { requiresAuth: true },
      },
      {
        path: '/admin/:tournamentId',
        component: routeComponent(AdminTournament),
        meta: { requiresAuth: true, adminUiV2 },
        children: [
          ...adminChildren,
          {
            path: 'rounds/:round',
            component: routeComponent(AdminRoundIndex),
            children: [
              { path: '', redirect: 'allocation' },
              { path: 'allocation', component: routeComponent(AdminRoundAllocation) },
              { path: 'result', component: routeComponent(AdminRoundResult) },
            ],
          },
          { path: 'results', redirect: redirectToOperationsSubmissions },
        ],
      },
      { path: '/user', component: routeComponent(UserHome) },
      {
        path: '/user/:tournamentId',
        component: routeComponent(UserTournament),
        children: [
          { path: '', redirect: 'home' },
          { path: 'home', component: routeComponent(UserTournamentHome) },
          { path: 'results', component: routeComponent(UserTournamentResults) },
          {
            path: ':participant(audience|speaker|adjudicator)',
            component: routeComponent(UserParticipantLayout),
            children: [
              { path: '', redirect: 'home' },
              { path: 'home', component: routeComponent(UserParticipantHome) },
              {
                path: 'rounds/:round',
                component: routeComponent(UserParticipantRoundLayout),
                children: [
                  { path: '', redirect: 'home' },
                  { path: 'home', component: routeComponent(UserRoundHome) },
                  {
                    path: 'draw',
                    redirect: (to: any) => ({
                      path: `/user/${String(to.params.tournamentId ?? '')}/${String(to.params.participant ?? '')}/home`,
                      query: to.query,
                    }),
                  },
                  {
                    path: 'ballot',
                    component: routeComponent(UserRoundBallot),
                    children: [
                      { path: '', redirect: 'home' },
                      { path: 'home', component: routeComponent(UserRoundBallotHome) },
                      { path: 'entry', component: routeComponent(UserRoundBallotEntry) },
                    ],
                  },
                  {
                    path: 'feedback',
                    component: routeComponent(UserRoundFeedback),
                    children: [
                      { path: '', redirect: 'home' },
                      { path: 'home', component: routeComponent(UserRoundFeedbackHome) },
                      { path: ':adjudicatorId', component: routeComponent(UserRoundFeedbackEntry) },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  })
}

export function setupRouterGuards(router: Router, pinia: Pinia): void {
  setActivePinia(pinia)
  router.beforeEach(async (to) => {
    const auth = useAuthStore()
    if (!auth.initialized) {
      await auth.fetchMe()
    }
    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }
    if (to.path.startsWith('/admin')) {
      const role = auth.role
      if (role !== 'superuser' && role !== 'organizer') {
        return { path: '/user' }
      }
    }
    return true
  })
}

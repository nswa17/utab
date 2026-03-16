import { createRouter, createWebHistory, type Router, type RouterHistory } from 'vue-router'
import type { Pinia } from 'pinia'
import { setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

type RouterOptions = {
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
const UserParticipantLayout = () => import('@/views/user/participant/UserParticipantLayout.vue')
const UserRoundBallotEntry = () => import('@/views/user/participant/round/ballot/UserRoundBallotEntry.vue')
const UserRoundFeedbackEntry = () => import('@/views/user/participant/round/feedback/UserRoundFeedbackEntry.vue')
const StubRouteComponent = { template: '<div />' }

export function createAppRouter(options: RouterOptions = {}): Router {
  const useStubComponents = options.stubComponents ?? false
  const routeComponent = (component: unknown) =>
    (useStubComponents ? StubRouteComponent : component) as any

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
        meta: { requiresAuth: true },
        children: [
          {
            path: '',
            redirect: (to: any) => ({
              path: `/admin/${String(to.params.tournamentId ?? '')}/setup`,
              query: to.query,
            }),
          },
          { path: 'setup', component: routeComponent(AdminTournamentHome) },
          { path: 'operations', component: routeComponent(AdminRoundOperationsHub) },
          { path: 'reports', component: routeComponent(AdminTournamentCompiled) },
          {
            path: 'rounds/:round',
            component: routeComponent(AdminRoundIndex),
            children: [
              {
                path: '',
                redirect: (to: any) => ({
                  path: `/admin/${String(to.params.tournamentId ?? '')}/rounds/${String(to.params.round ?? '')}/allocation`,
                  query: to.query,
                }),
              },
              { path: 'allocation', component: routeComponent(AdminRoundAllocation) },
              { path: 'result', component: routeComponent(AdminRoundResult) },
            ],
          },
        ],
      },
      { path: '/user', component: routeComponent(UserHome) },
      {
        path: '/user/:tournamentId',
        component: routeComponent(UserTournament),
        children: [
          {
            path: '',
            redirect: (to: any) => ({
              path: `/user/${String(to.params.tournamentId ?? '')}/home`,
              query: to.query,
            }),
          },
          { path: 'home', component: routeComponent(UserTournamentHome) },
          {
            path: '',
            component: routeComponent(UserParticipantLayout),
            children: [
              {
                path: 'rounds/:round/ballot/entry',
                component: routeComponent(UserRoundBallotEntry),
              },
              {
                path: 'rounds/:round/feedback/:adjudicatorId([A-Za-z0-9_-]{5,})',
                component: routeComponent(UserRoundFeedbackEntry),
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
      if (!auth.canAccessAdmin) {
        return { path: '/user' }
      }
    }
    return true
  })
}

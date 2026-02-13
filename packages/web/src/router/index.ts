import { createRouter, createWebHistory, type Router } from 'vue-router'
import type { Pinia } from 'pinia'
import { setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import LoginView from '@/views/Login.vue'
import SignupView from '@/views/Signup.vue'
import AdminHome from '@/views/admin/AdminHome.vue'
import AdminTournament from '@/views/admin/AdminTournament.vue'
import AdminTournamentHome from '@/views/admin/AdminTournamentHome.vue'
import AdminTournamentRounds from '@/views/admin/AdminTournamentRounds.vue'
import AdminTournamentSubmissions from '@/views/admin/AdminTournamentSubmissions.vue'
import AdminTournamentCompiled from '@/views/admin/AdminTournamentCompiled.vue'
import AdminRoundOperationsHub from '@/views/admin/AdminRoundOperationsHub.vue'
import AdminRoundIndex from '@/views/admin/round/AdminRoundIndex.vue'
import AdminRoundAllocation from '@/views/admin/round/AdminRoundAllocation.vue'
import AdminRoundResult from '@/views/admin/round/AdminRoundResult.vue'
import UserHome from '@/views/user/UserHome.vue'
import UserTournament from '@/views/user/UserTournament.vue'
import UserTournamentHome from '@/views/user/UserTournamentHome.vue'
import UserTournamentResults from '@/views/user/UserTournamentResults.vue'
import UserParticipantLayout from '@/views/user/participant/UserParticipantLayout.vue'
import UserParticipantHome from '@/views/user/participant/UserParticipantHome.vue'
import UserParticipantRoundLayout from '@/views/user/participant/round/UserParticipantRoundLayout.vue'
import UserRoundHome from '@/views/user/participant/round/UserRoundHome.vue'
import UserRoundDraw from '@/views/user/participant/round/UserRoundDraw.vue'
import UserRoundBallot from '@/views/user/participant/round/UserRoundBallot.vue'
import UserRoundFeedback from '@/views/user/participant/round/UserRoundFeedback.vue'
import UserRoundBallotHome from '@/views/user/participant/round/ballot/UserRoundBallotHome.vue'
import UserRoundBallotEntry from '@/views/user/participant/round/ballot/UserRoundBallotEntry.vue'
import UserRoundFeedbackHome from '@/views/user/participant/round/feedback/UserRoundFeedbackHome.vue'
import UserRoundFeedbackEntry from '@/views/user/participant/round/feedback/UserRoundFeedbackEntry.vue'
import { isAdminUiV2Enabled } from '@/config/feature-flags'

type RouterOptions = {
  adminUiV2?: boolean
}

export function createAppRouter(options: RouterOptions = {}): Router {
  const adminUiV2 = options.adminUiV2 ?? isAdminUiV2Enabled()
  const adminChildren = adminUiV2
    ? [
        {
          path: '',
          redirect: (to: any) => ({
            path: `/admin/${String(to.params.tournamentId ?? '')}/setup`,
            query: to.query,
          }),
        },
        { path: 'setup', component: AdminTournamentHome },
        {
          path: 'home',
          redirect: (to: any) => ({
            path: `/admin/${String(to.params.tournamentId ?? '')}/setup`,
            query: to.query,
          }),
        },
        { path: 'operations', component: AdminRoundOperationsHub },
        {
          path: 'rounds',
          redirect: (to: any) => ({
            path: `/admin/${String(to.params.tournamentId ?? '')}/operations`,
            query: to.query,
          }),
        },
        { path: 'submissions', component: AdminTournamentSubmissions },
        { path: 'reports', component: AdminTournamentCompiled },
        {
          path: 'compiled',
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
        { path: 'home', component: AdminTournamentHome },
        { path: 'setup', component: AdminTournamentHome },
        { path: 'rounds', component: AdminRoundOperationsHub },
        { path: 'operations', component: AdminRoundOperationsHub },
        { path: 'submissions', component: AdminTournamentSubmissions },
        { path: 'compiled', component: AdminTournamentCompiled },
        { path: 'reports', component: AdminTournamentCompiled },
      ]
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', redirect: '/user' },
      { path: '/login', component: LoginView },
      { path: '/signup', component: SignupView },
      { path: '/admin', component: AdminHome, meta: { requiresAuth: true } },
      {
        path: '/admin-embed/:tournamentId/rounds/:round/allocation',
        component: AdminRoundAllocation,
        meta: { requiresAuth: true },
      },
      {
        path: '/admin-embed/:tournamentId/submissions',
        component: AdminTournamentSubmissions,
        meta: { requiresAuth: true },
      },
      {
        path: '/admin-embed/:tournamentId/rounds/settings',
        component: AdminTournamentRounds,
        meta: { requiresAuth: true },
      },
      {
        path: '/admin/:tournamentId',
        component: AdminTournament,
        meta: { requiresAuth: true, adminUiV2 },
        children: [
          ...adminChildren,
          {
            path: 'rounds/:round',
            component: AdminRoundIndex,
            children: [
              { path: '', redirect: 'allocation' },
              { path: 'allocation', component: AdminRoundAllocation },
              { path: 'result', component: AdminRoundResult },
            ],
          },
          { path: 'results', redirect: 'submissions' },
        ],
      },
      { path: '/user', component: UserHome },
      {
        path: '/user/:tournamentId',
        component: UserTournament,
        children: [
          { path: '', redirect: 'home' },
          { path: 'home', component: UserTournamentHome },
          { path: 'results', component: UserTournamentResults },
          {
            path: ':participant(audience|speaker|adjudicator)',
            component: UserParticipantLayout,
            children: [
              { path: '', redirect: 'home' },
              { path: 'home', component: UserParticipantHome },
              {
                path: 'rounds/:round',
                component: UserParticipantRoundLayout,
                children: [
                  { path: '', redirect: 'home' },
                  { path: 'home', component: UserRoundHome },
                  { path: 'draw', component: UserRoundDraw },
                  {
                    path: 'ballot',
                    component: UserRoundBallot,
                    children: [
                      { path: '', redirect: 'home' },
                      { path: 'home', component: UserRoundBallotHome },
                      { path: 'entry', component: UserRoundBallotEntry },
                    ],
                  },
                  {
                    path: 'feedback',
                    component: UserRoundFeedback,
                    children: [
                      { path: '', redirect: 'home' },
                      { path: 'home', component: UserRoundFeedbackHome },
                      { path: ':adjudicatorId', component: UserRoundFeedbackEntry },
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

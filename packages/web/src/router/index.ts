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
import AdminRoundIndex from '@/views/admin/round/AdminRoundIndex.vue'
import AdminRoundAllocation from '@/views/admin/round/AdminRoundAllocation.vue'
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

export function createAppRouter(): Router {
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
        path: '/admin/:tournamentId',
        component: AdminTournament,
        meta: { requiresAuth: true },
        children: [
          { path: '', redirect: 'home' },
          { path: 'home', component: AdminTournamentHome },
          { path: 'rounds', component: AdminTournamentRounds },
          { path: 'submissions', component: AdminTournamentSubmissions },
          { path: 'compiled', component: AdminTournamentCompiled },
          {
            path: 'rounds/:round',
            component: AdminRoundIndex,
            children: [
              { path: '', redirect: 'allocation' },
              { path: 'allocation', component: AdminRoundAllocation },
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

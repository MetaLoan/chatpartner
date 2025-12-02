import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/dashboard',
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/Dashboard.vue'),
  },
  {
    path: '/accounts',
    name: 'Accounts',
    component: () => import('@/views/AccountsPlaywright.vue'),
  },
  {
    path: '/accounts-legacy',
    name: 'AccountsLegacy',
    component: () => import('@/views/Accounts.vue'),
  },
  {
    path: '/groups',
    name: 'Groups',
    component: () => import('@/views/Groups.vue'),
  },
  {
    path: '/messages',
    name: 'Messages',
    component: () => import('@/views/Messages.vue'),
  },
  {
    path: '/statistics',
    name: 'Statistics',
    component: () => import('@/views/Statistics.vue'),
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/Settings.vue'),
  },
  {
    path: '/info-pool',
    name: 'InfoPool',
    component: () => import('@/views/InfoPool.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router


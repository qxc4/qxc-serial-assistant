import { createRouter, createWebHistory } from 'vue-router'
import SerialView from '../views/SerialView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: SerialView
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue')
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('../views/ProfileView.vue')
    },
    {
      path: '/ascii',
      name: 'ascii',
      component: () => import('../views/AsciiView.vue')
    },
    {
      path: '/converter',
      name: 'converter',
      component: () => import('../views/NumConverterView.vue')
    }
  ]
})

export default router

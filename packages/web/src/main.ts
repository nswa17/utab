import { createApp, type Plugin } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import HighchartsVue from 'highcharts-vue'
import 'element-plus/dist/index.css'
import './styles.css'
import App from './App.vue'
import { createAppRouter, setupRouterGuards } from './router/index.js'
import { i18n } from './i18n'
import { setupApiInterceptors } from './utils/api'

const app = createApp(App)
const pinia = createPinia()
const router = createAppRouter()

app.use(pinia)
app.use(router)
app.use(i18n)
app.use(ElementPlus)
app.use(HighchartsVue as unknown as Plugin)

setupRouterGuards(router, pinia)
setupApiInterceptors(router)

app.mount('#app')

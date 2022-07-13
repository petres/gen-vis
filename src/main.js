import { createApp } from 'vue'

import '../assets/styles/main.scss'

import App from '@/App.vue'
import { createPinia } from 'pinia'

import globals from '@/globals.js'

const attrs = {
    debug: true,
    def: `/data/${globals.def}`,
}

const app = createApp(App, attrs)
    .use(createPinia())
    .mount('#app')

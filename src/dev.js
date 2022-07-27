import { createApp } from 'vue'

import '../assets/styles/main.scss'

import App from '@/comp/App.vue'
import { createPinia } from 'pinia'

import globals from '@/globals.js'

const attrs = {
    debug: true,
    defFile: `/data/${globals.def}`,
    // def: '{"a": 3}',
}

const app = createApp(App, attrs)
    .use(createPinia())
    .mount('#app')

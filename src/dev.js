import { createApp } from 'vue'

import '../assets/styles/main.scss'

import GenVis from '@/comp/App.vue'

import globals from '@/globals.js'

createApp(GenVis, {
    debug: true,
    defFile: `/data/${globals.def}`,
}).mount('#app')

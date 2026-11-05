// the page of the dev server, all definitions in data/, see Gallery.vue
import { createApp } from 'vue'
import Gallery from '@/dev/Gallery.vue'
// the default font of the package, as the builds have it (see vite.config.js)
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-ext-400.css'
import '@fontsource/inter/latin-ext-600.css'

createApp(Gallery).mount('#app')

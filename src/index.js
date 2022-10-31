export { mountGenVisElement, mountGenVisByClass };

import { createApp } from 'vue'
import App from '@/comp/App.vue'
import { createPinia } from 'pinia'


// const { createApp } = require('vue')
// const App = require('@/comp/App.vue')
// const { createPinia } = require('pinia')

const mountGenVisElement = element => {
    const attrs = element.getAttributeNames()
        .filter(name => name.startsWith('data-'))
        .reduce((acc, name) => {
            return {...acc, [name.substring(5)]: element.getAttribute(name)};
        }, {});
    // console.log(attrs);
    createApp(App, attrs)
        .use(createPinia())
        .mount(element)
}

const mountGenVisByClass = cl => {
    const es = document.getElementsByClassName(cl);
    // console.log(es)
    for (const e of es) {
        if (!e.classList.contains('gen-vis-attached')) {
            e.classList.add('gen-vis-attached')
            mountGenVisElement(e);
        }
    }
}

import { createApp } from 'vue'

import '../assets/styles/main.scss'

import App from '@/comp/App.vue'
import { createPinia } from 'pinia'

window.mountGenVisElement = element => {
    const attrs = element.getAttributeNames()
        .filter(name => name.startsWith('data-'))
        .reduce((acc, name) => {
            return {...acc, [name.substring(5)]: element.getAttribute(name)};
        }, {});
    // console.log(attrs);
    const app = createApp(App, attrs)
        .use(createPinia())
        .mount(element)
}

window.mountGenVisByClass = cl => {
    const es = document.getElementsByClassName(cl);
    for (const e of es) {
        window.mountGenVisElement(e);
    }
}

// the Vue adapter of the package (`@preschen/gen-vis/vue`): the component
// GenVis of the Vue of the application (a peer dependency), the plugin which
// registers it (`app.use(GenVis)`) and the factories of another Vue, see
// README "Vue component"
export { GenVis, createVueComponent, vuePlugin };

import * as Vue from 'vue';
import { createVueComponent, vuePlugin } from '@/vue-adapter';

const GenVis = createVueComponent(Vue);

// the plugin of Vue, registers the <GenVis> component
export default {
    install(app) {
        app.component('GenVis', GenVis);
    },
};

// the Vue adapter of the package (`@preschen/gen-vis/vue`): the component
// GenVis of the Vue of the application (a peer dependency), the plugin which
// registers it (`app.use(GenVis)`) and the factories of another Vue, see
// docs/usage.md "Vue component"
export { GenVis, createVueComponent, vuePlugin };

import { h, render } from 'vue';
import { createVueComponent, vuePlugin } from '@/vue-adapter';

const GenVis = createVueComponent({ h, render });

// the plugin of Vue, registers the <GenVis> component
export default {
    install(app) {
        app.component('GenVis', GenVis);
    },
};

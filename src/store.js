import { defineStore } from 'pinia'
import axios from 'axios';

import * as du from "@/utils/data";
import * as ju from "@/utils/json";

const modUrl = (url) => {
    if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0 || url.indexOf('/') === 0 || url.indexOf('.') === 0) {
        return url;
    }
    return `./${url}`;
}

export const baseStore = defineStore('base', {
    state: () => ({
        defOrg: null,
        def: null,
        data: null,
    }),
    getters: {
        loaded() { return (this.def !== null && this.data !== null)},
        axis() {
            const b = this.mappingNamesWithKey('scale');
            // console.log(b)
            let axis = {h: [], v: []};
            b.forEach(n => {
                const r = this.mapping(n).scale.orientation;
                if (r == 'horizontal')
                    axis.h.push(n);
                if (r == 'vertical')
                    axis.v.push(n);
            });
            return axis;
        },
        mapping(n) { return n => this.def.mapping[n]},
        prop(n, k) { return (n, k) => this.def.mapping[n].props[k]},
        mappingNamesWithKey(k) { return k => Object.keys(this.def.mapping).filter(n => (k in this.def.mapping[n]))},
        mappingNamesWithKeyValue(k, v) { return (k, v) => Object.keys(this.def.mapping).filter(n => (k in this.def.mapping[n] && this.def.mapping[n][k] == v))},
    },
    actions: {
        init(def, data = null) {
            this.defOrg = def;
            if(typeof def == "string") {
                console.error(`No valid JSON definiton file`)
                throw new Error('No valid JSON definiton');
            }
            this.def = ju.prepareDef(JSON.parse(JSON.stringify(def)))
            if (data === null) {
                this.loadData();
            } else {
                this.data = du.prepareData(data, this.def);
            }
        },
        load(def) {
            return axios
                .get(modUrl(def))
                .then(response => {
                    this.init(response.data);
                })
                .catch((error) => {
                    // console.log(error)
                    console.error(`Could not load def file ${modUrl(def)}`)
                })
        },
        loadData() {
            return axios
                .get(modUrl(this.def.data))
                .then(response => {
                    // console.log(response.data)
                    this.data = du.prepareData(response.data, this.def);
                })
                .catch((error) => {
                    console.error(`Could not load data file '${modUrl(this.def.data)}'`)
                })
        },
    },
})

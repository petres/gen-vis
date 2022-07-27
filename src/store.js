import { defineStore } from 'pinia'
import axios from 'axios';

import * as du from "@/utils/data";
import * as ju from "@/utils/json";

export const baseStore = defineStore('base', {
    state: () => ({
        defOrg: null,
        def: null,
        data: null,
    }),
    getters: {
        loaded() { return (this.def !== null && this.data !== null)},
        mapping(n) { return n => this.def.mapping[n]},
        prop(n, k) { return (n, k) => this.def.mapping[n].props[k]},
        mappingNamesWithKey(k) { return k => Object.keys(this.def.mapping).filter(n => (k in this.def.mapping[n]))},
        mappingNamesWithKeyValue(k, v) { return (k, v) => Object.keys(this.def.mapping).filter(n => (k in this.def.mapping[n] && this.def.mapping[n][k] == v))},
    },
    actions: {
        init(def, data = null) {
            // console.log(def)
            this.defOrg = def;
            this.def = ju.prepareDef(JSON.parse(JSON.stringify(def)))
            if (data === null) {
                this.loadData();
            } else {
                this.data = du.prepareData(data);
            }
        },
        load(def) {
            return axios
                .get(def)
                .then(response => {
                    this.init(response.data);
                })
        },
        loadData() {
            return axios
                .get(`./${this.def.data}`)
                .then(response => {
                    // console.log(response.data)
                    this.data = du.prepareData(response.data, this.def);
                })
        },
    },
})

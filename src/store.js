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
        mappingNamesWithKey(k) { return k => Object.keys(this.def.mapping).filter(n => (k in this.def.mapping[n]))},
    },
    actions: {
        load(def) {
            return this.loadDef(def).then(() => {
                // console.log(this.def)
                this.loadData();
            })
        },
        loadDef(def) {
            return axios
                .get(def)
                .then(response => {
                    this.defOrg = response.data;
                    this.def = ju.prepareDef(JSON.parse(JSON.stringify(this.defOrg)))
                })
        },
        loadData() {
            return axios
                .get(`./${this.def.data}`)
                .then(response => {
                    this.data = du.prepareData(response.data, this.def);
                })
        },
    },
})

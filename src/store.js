import { defineStore } from 'pinia'
import axios from 'axios';

import * as du from "@/utils/data";

export const baseStore = defineStore('base', {
    state: () => ({
        defOrg: null,
        def: null,
        data: null,
    }),
    getters: {
        loaded() { return (this.def !== null && this.data !== null)}
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
                    this.defOrg = response.data
                    this.def = JSON.parse(JSON.stringify(this.defOrg))
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

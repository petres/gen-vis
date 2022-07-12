import { defineStore } from 'pinia'
import axios from 'axios';

import globals from '@/globals.js'
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
        load() {
            return this.loadDef().then(() => {
                // console.log(this.def)
                this.loadData();
            })
        },
        loadDef() {
            return axios
                .get(`/data/${globals.def}`)
                .then(response => {
                    this.defOrg = response.data
                    this.def = JSON.parse(JSON.stringify(this.defOrg))
                })
        },
        loadData() {
            return axios
                .get(`/data/${this.def.data}`)
                .then(response => {
                    this.data = du.prepareData(response.data, this.def);
                })
        },
    },
})

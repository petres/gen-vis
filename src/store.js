import { defineStore } from 'pinia'
import axios from 'axios';
import * as d3 from "d3";

export const baseStore = defineStore('base', {
    state: () => ({
        def: null,
        data: null,
    }),
    getters: {
        loaded() { return (this.def !== null && this.data !== null)}
    },
    actions: {
        load() {
            this.loadDef().then(() => {
                // console.log(this.def)
                this.loadData();
            })
        },
        loadDef() {
            return axios
                .get(`/data/def.json`)
                .then(response => {
                    this.def = response.data
                })
        },
        loadData() {
            return axios
                .get(`/data/${this.def.data}`)
                .then(response => {
                    this.data = d3.csvParse(response.data)
                })
        },
    },
})

import { defineStore } from 'pinia'
import axios from 'axios';

import * as du from "@/utils/data";
import * as ju from "@/utils/json";

const modUrl = (url, defUrl = null) => {
    if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0 || url.indexOf('/') === 0) {
        return url;
    }

    if (defUrl) {
        return `${defUrl.substring(0, defUrl.lastIndexOf("/"))}/${url}`;
    }
    
    return `./${url}`;
}

export const baseStore = defineStore('base', {
    state: () => ({
        defUrl: null,
        defOrg: null,
        def: null,
        rows: null,
        data: null,
    }),
    getters: {
        loaded() { return (this.def !== null && this.data !== null)},
        axis() {
            const b = this.mappingNamesWithKey('scale');
            // console.log(b)
            let axis = {};
            // let axis = {h: [], v: []};
            b.forEach(n => {
                const r = this.mapping(n).scale.orientation;
                if (r == 'horizontal') {
                    axis.h = n;
                    // axis.h.push(n);
                }
                    
                if (r == 'vertical') {
                    axis.v = n;
                    // axis.v.push(n);
                }
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
            const self = this;
            this.loadAndMergeParent(def, [def], function(defResolved) {
                self.defOrg = defResolved;
                self.def = ju.prepareDef(JSON.parse(JSON.stringify(self.defOrg)))
                ju.applyFormElements(self.def, self.defOrg);
                if (data === null) {
                    self.loadData();
                } else {
                    self.setData(data);
                }
            })
        },
        loadAndMergeParent(def, parents, call) {
            const self = this;
            if(typeof def == "string") {
                console.error(`No valid JSON definiton file`)
                throw new Error('No valid JSON definiton');
            }
            if (def.parent) {
                this.load(def.parent, function(defParent) {
                    parents.push(defParent);
                    self.loadAndMergeParent(defParent, parents, call);
                })
            } else {
                // console.log(parents)
                parents.reverse();
                const merged = ju.mergeAll(parents);
                // console.log(merged)
                call(merged);
            }
        },
        load(defUrl, call = this.init) {
            const defUrlM = modUrl(defUrl);
            this.defUrl ??= defUrlM;
            return axios
                .get(defUrlM)
                .then(response => {
                    call(response.data);
                })
                .catch((error) => {
                    console.log(error)
                    console.error(`Could not load def file ${defUrlM}`)
                })
        },
        loadData() {
            return axios
                .get(modUrl(this.def.data, this.defUrl))
                .then(response => {
                    // console.log(response.data)
                    this.setData(response.data);
                })
                .catch((error) => {
                    console.error(`Could not load data file '${modUrl(this.def.data)}'`)
                })
        },
        setData(data) {
            this.rows = du.parseData(data);
            this.data = du.prepareData(this.rows, this.def);
        },
        // the columns of patched mappings might have changed
        applyFormElements() {
            if (ju.applyFormElements(this.def, this.defOrg))
                this.data = du.prepareData(this.rows, this.def);
        },
    },
})

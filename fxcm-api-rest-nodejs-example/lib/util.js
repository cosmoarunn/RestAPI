const util = require('util')
const _ = require('lodash');
const OS = require('os')
var Utils = { 
   

    safeParseJSON: function(data) { 
        if(!data) return {};
        try {
            return JSON.parse(data);
        } catch (e) {
            console.log(e)
            return {}
        }
    },
    /**
     *  Promisify a function - helper
     * 
     */
    promisify: function(fn) { 
        let promisify
        return promisify = fn => (...args) => new Promise((resolve, reject) => {
                fn(...args, (error, value) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(value);
                });
            })
    } 

}

module.exports = Utils;
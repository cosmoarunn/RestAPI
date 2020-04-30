const request = require('request');
const https = require('https');
const { Readable } = require('stream');
const {v4: uuid} = require('uuid')
const io = require('socket.io-client');
const querystring = require('querystring');
const DEFAULT_TIMEOUT = 10 * 1000; // 10 sec
const config = '../config'
const Utils = require('./util')
const liveRates = require('./LiveRates')

class FxcmClient {
    constructor(apiURI , options = {}) {
        this.productID = 'GBP/USD';
        if (apiURI && !apiURI.startsWith('https')) {
            process.emitWarning(
                '`FxcmClient` no longer accepts an unsecured (http) protocol. Enter to continue..',
                'DeprecationWarning'
            );
        }
        this.apiURI = apiURI;
        this.API_LIMIT = 100;
        this.token = options.token 
        this.timeout = +options.timeout > 0 ? options.timeout : DEFAULT_TIMEOUT;
        this.socket = null;
        this.alive = false;
        this.liveRates = null
        this.request_headers = {
            'User-Agent': 'request',
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
        }

        //Utils.promisify(this.authenticate())
        if(this.socket) { 
            this.socket.on('connect', () => { 
                this.request_headers.Authorization = 'Bearer ' + this.socket.id + this.token;
                console.log('Socket.IO session has been opened: ', this.socket.id);
                this.alive = true;
                liveRates(this.liveRatesSocket)
            });
            // fired when socket.io cannot connect (network errors)
            this.socket.on('connect_error', (error) => {
                console.log('Socket.IO session connect error: ', error);
                this.alive = false;
            });
            // fired when socket.io cannot connect (api session errors)
            this.socket.on('error', (error) => {
                console.log('Socket.IO session error: ', error);
                this.alive = false;
            });
            // fired when socket.io disconnects from the server
            this.socket.on('disconnect', () => {
                console.log('Socket disconnected, terminating client.');
                process.exit(-1); 
            });
        }
    }

    authenticate() { 
        this.socket = io(this.apiURI, {
			query: querystring.stringify({
				access_token: this.token
			}) 
        });
         //use minimal resources to run io socket for live rates
        this.liveRatesSocket = io(this.apiURI, { 
                query: querystring.stringify({
				access_token: this.token
            }) 
        })

        //this.tablesSocket = io('/tables')

    }

    get(...args) {
        return this.request('GET', ...args)
    }
    put(...args) {
        return this.request('PUT', ...args)
    }
    post(...args) { 
        return this.request('POST', ...args)
    }
    delete(...args) {
        return this.request('DELETE', ...args)
    }

    addHeaders(obj, additional) {
        obj.headers = obj.headers || {};
        return Object.assign(
        obj.headers,
        {
            'User-Agent': 'request',
             Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        additional
        );
    }

    makeRelativeURI(parts) {
        return '/' + parts.join('/');
    }

    makeAbsoluteURI(relativeURI) {
        return this.apiURI + relativeURI;
    }

    makeRequestCallback(callback, reqId, resolve, reject) {
        return (err, response, data) => { 
            data = Utils.safeParseJSON(data)
            if (err) {
                err.response = response;
                err.data = data;
            } else if (response.statusCode > 299) {
            err = new Error(
                `HTTP ${response.statusCode} Error: ${data && data.message}`
            );
            err.response = response;
            err.data = data;
            } else if (data === null) {
                err = new Error('Response could not be parsed as JSON');
                err.response = response;
                err.data = data;
            }

            if (typeof callback === 'function') {
            if (err) {
                callback(err);
            } else {
                callback(null, response, data);
            }
                return;
            }

            if (err) 
                reject(err);
            else 
                resolve(data);
            
        };
    }
    /**
     *  The Original Request
     */
    request(method, uriParts, qs, opts = {}, callback) { //console.log("query string:"); console.log(qs)
        if (!callback && typeof opts === 'function') {
            callback = opts;
            opts = {};
        }
        const requestID = uuid()
        Object.assign(opts, {
            uri:  this.apiURI + this.makeRelativeURI(uriParts),
            method: method.toUpperCase(),
            qsStringifyOptions: { arrayFormat: 'repeat' },
            timeout: this.timeout,
        });
        

        var p = new Promise((resolve, reject) => { 
           
            if(method !== 'GET' && 'undefined' !== typeof qs) { 
                Object.assign(opts, {
                    timeout: this.timeout,
                    form: qs,
                });
                this.addHeaders(opts, {'Content-Type': 'application/x-www-form-urlencoded'})
                this.addHeaders(opts, {Authorization : 'Bearer ' + this.liveRatesSocket.id + this.token })

                request.post(opts, this.makeRequestCallback(callback, requestID, resolve, reject))
            }else { 
                Object.assign(opts, { 
                    method: method.toUpperCase(),
                    uri:  this.makeAbsoluteURI(this.makeRelativeURI(uriParts)) + "/?" + qs,
                    qsStringifyOptions: { arrayFormat: 'repeat' },
                    timeout: this.timeout,
                });
                this.addHeaders(opts, {Authorization : 'Bearer ' + this.socket.id + this.token })
                console.log(opts)
                request(opts, this.makeRequestCallback(callback, requestID, resolve, reject));
            }

        });
        
        if (callback) {
            p.catch((e) => { }); 
            return undefined;
        } else {
            return p;
        }
        request.end()
    }

    getAccounts(callback) { 
       if(this.alive) { 
            return this.get(['trading', 'get_model'], querystring.stringify({"models":["Account"]}), callback);
        } else console.log('fxcm client not connected!')
    }

    getProducts(callback) {
        if(this.alive) { console.log('retrieving products..')
            return this.get(['trading/get_instruments'], callback);
        } else console.log('Fxcm client not connected!')
    }

    getProductOrderBook(callback) {
        //[productID, callback] = this._normalizeProductArgs( productID, args, callback, 'getProductOrderBook' );

        //const path = ['products', productID, 'book'];
        //return this.get(path, { qs: args }, callback);
        if(this.alive) { 
            return this.post(['trading', 'subscribe'], querystring.stringify({"models":["Order"]}), callback);
        } else console.log('Fxcm client not connected!')
    }

    unsubscribeliveRates(pairs, callback) { 
        

        if(this.alive) { 
            return this.post(['unsubscribe'],querystring.stringify({"pairs":["GBP/USD", "USD/JPY"]}), clbk);
        } else console.log('fxcm client not connected!')
    }

    subscribeliveRates(pairs, callback) { //console.log("the pairs: "); console.log(pairs)
    /*    const ascendant = this
    
        //handle callback
        const clbk =  (statusCode, requestID, data) => { //console.log("calling back with status: "); console.log(data)
            let parsed 
            if (statusCode === 200 && data) {
                try{
                    parsed = JSON.parse(data);
                }catch (e) {
                    console.log('error subscribing live rates:', e);
                    return;
                }
            } else { 
                console.log("Error ("+statusCode+"):" + JSON.stringify(data))
                return;
            }
            //Use a child socket for continuous live subscription once subscribed successfully
            if(parsed.response.executed) {
                try {
					for(var i in parsed.pairs) {
						ascendant.liveRatesSocket.on(parsed.pairs[i].Symbol, liveRates.processliveRates);
					}
				} catch (e) {
					console.log('subscribe request #', requestID, ' "pairs" JSON parse error: ', e);
					return;
				}
            } else { 
				console.log('execution failed: \r\n', parsed);
            }
            
            
        };
*/
        if(this.alive) { 
            return this.post(['subscribe'],querystring.stringify({"pairs":["GBP/USD", "USD/JPY"]}), this.liveRates.processliveRates());
        } else console.log('fxcm client not connected!')
    }

    getTicks(callback) {

    }
    
    getProductTicker(productID, callback) {
        [productID, , callback] = this._normalizeProductArgs(
        productID,
        null,
        callback, 
        'getProductTicker'
        );

        const path = ['products', productID, 'ticker'];
        return this.post(path, callback);
    }

    //Utility functions
    _normalizeProductArgs(productID, args, callback, caller) {
        this._deprecationWarningProductIdMissing(productID, caller);

        callback = [callback, args, productID].find(byType('function'));
        args = [args, productID, {}].find(byType('object'));
        productID = [productID, this.productID].find(byType('string'));

        if (!productID) {
            throw new Error('No productID specified.');
        }

        return [productID, args, callback];
    }

    //Warnings
    _deprecationWarningProductIdMissing(productID, caller) {
        if (!productID || typeof productID !== 'string') {
        process.emitWarning(
            `\`${caller}()\` now requires a product ID as the first argument. ` +
            `Attempting to use FxcmClient#productID (${
                this.productID
            }) instead.`,
            'DeprecationWarning'
        );
        }
    }
}




module.exports = exports = FxcmClient;
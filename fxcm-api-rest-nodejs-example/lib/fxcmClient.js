const request = require('request');
const { Readable } = require('stream');
const io = require('socket.io-client');
const querystring = require('querystring');
const DEFAULT_TIMEOUT = 10 * 1000; // 10 sec
const config = '../config'

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
        this.request_headers = {
            'User-Agent': 'request',
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
        }

        this.authenticate()
 
        this.socket.on('connect', () => { console.log(this.alive)
            this.request_headers.Authorization = 'Bearer ' + this.socket.id + this.token;
            console.log('Socket.IO session has been opened: ', this.socket.id);
            this.alive = true;
            
        });
        // fired when socket.io cannot connect (network errors)
        this.socket.on('connect_error', (error) => {
            console.log('Socket.IO session connect error: ', error);
            this.alive = false;
        });
        // fired when socket.io cannot connect (login errors)
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

    authenticate() { 
        this.socket = io(this.apiURI, {
			query: querystring.stringify({
				access_token: this.token
			}) 
        });
         //use minimal resources to run io socket for live rates
        this.liveRatesSocket = io('/live')
    }

    get(...args) {
        
        return this.request('get', ...args).then((response) => (console.log(response))).catch(() => { });
    }
    put(...args) {
        return this.request('put', ...args);
    }
    post(...args) {
        return this.request('post', ...args);
    }
    delete(...args) {
        return this.request('delete', ...args);
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

    makeRequestCallback(callback, resolve, reject) {
    return (err, response, data) => { console.log(data)
        try {
            data = JSON.parse(data);
        } catch (e) {
            data = null;
        }

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

        if (err) {
        reject(err);
        } else {
        resolve(data);
        }
    };
    }
    /**
     *  The Request
     */
    request(method, uriParts, qs, opts = {}, callback) {
        if (!callback && typeof opts === 'function') {
            callback = opts;
            opts = {};
        }
        
        //opts.headers.Authorization = `Bearer ${this.socket.id}  ${this.token}`;
        Object.assign(opts, {
            method: method.toUpperCase(),
            uri:  this.makeAbsoluteURI(this.makeRelativeURI(uriParts)) + "/?" + qs,
            qsStringifyOptions: { arrayFormat: 'repeat' },
            timeout: this.timeout,
           
        });
        
        this.addHeaders(opts, {Authorization : 'Bearer ' + this.socket.id + this.token })
        const p = new Promise((resolve, reject) => { 
            request(opts, this.makeRequestCallback(callback, resolve, reject));
        });
        
        if (callback) {
            p.catch(() => {}); 
            return undefined;
        } else {
            return p;
        }
    }

    getProducts(callback) {
        if(this.alive) { console.log('retrieving products..')
            return this.get(['trading/get_instruments'], callback);
        } else console.log('fxcm client not connected!')
    }

    getAccounts(callback) { 
       if(this.alive) { 
            return this.get(['trading', 'get_model'], querystring.stringify({"models":["Account"]}), callback);
        } else console.log('fxcm client not connected!')
    }

     getProductTicker(productID, callback) {
        [productID, , callback] = this._normalizeProductArgs(
        productID,
        null,
        callback,
        'getProductTicker'
        );

        const path = ['products', productID, 'ticker'];
        return this.get(path, callback);
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
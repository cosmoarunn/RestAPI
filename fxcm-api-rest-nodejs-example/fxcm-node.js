/*
 *  socknode.js
 *  Package: FXCM Node
 *
 *  Description : A Socket node to connects to fxcm api socket as eventemiter and perform requested functions (data transfer)
 *  Author: Arun Panneerselvam
 *  email: arun@gsunitedtechnologies.com
 *  website: arunpanneerselvam.com
 */
const _ = require('lodash');
const path = require('path');
const config    = require( "./config.js"  )
const {EventEmitter} = require('events')
const https = require('https')
const net  = require('net')
const io = require('socket.io-client');
const querystring = require('querystring')
const WebSocket = require('ws')
const bodyParser = require('body-parser')
const moment = require('moment')
const keypress = require('keypress')
const {v4: uuid} = require('uuid')
const qs = require('querystring')
const readline = require('readline');
const Utils = require('./lib/util')
const fxcmClient = new (require('./lib/fxcmClient'))(`${config.trading_api_proto}://${config.trading_api_host}`, {token : config.token })


const STATE = {idle: Symbol('idle'), status: Symbol('status')}

let commands, requests = new Map()

class FxcmNode extends EventEmitter { 

    constructor(protocol, host, port, token = null, account = null, username=null, password=null, database=null) {
        super()
        this.state = STATE.idle
        this.protocol = protocol || config.trading_api_proto
        this.host = host || config.trading_api_host
        this.port = port || config.trading_api_port
        this.token = token || config.token
        this.username = username || null
        this.account = account
        this.database =  database
        this.offers = []
        this.orders = []
        this.trades 
        this.alive = false
        this.showConsole = false
        this.connectionRes = false
        this.connectionProps = []
        this.connections = new Map()
        this.oldConnections = new Map()
        this.socket = new net.Socket()
        this.request_headers = {
            'User-Agent': 'request',
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        this.req_id = uuid()
        this.requests = new Map() //Successful requests from command line
        this.commands = new Map() //All commands entered
        this._client = new EventEmitter(),
        this.connected = false 
        this.liveRatesSocket
        //Uncomment authenticate to work live
       // Utils.promisify(this.authenticate())
        
        //initialize console on first run
        if (this.showConsole)
            this.init_console();

        this.socket.on('connect', () => { console.log(this.alive)
            console.log('Socket.IO session has been opened: ', this.socket.id);
            this.request_headers.Authorization = 'Bearer ' + this.socket.id + this.token;
            this.alive = true;
            this.init_console();
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
        this._client.emit('prompt');
    }
    /**
     *  For https connections using access_token 
     * 
     */
    authenticate() { 
        this.socket = io(this.protocol + '://' + this.host + ':' + this.port, {
			query: querystring.stringify({
				access_token: this.token
			}) 
        });
         //use minimal resources to run io socket for live rates
        //this.liveRatesSocket = io('/live')
        //this.tablesSocket = io('/tables')

        //console.log(this.liveRatesSocket)
    }
   
    /**
     * 
     *  Start a dedicated console
     */
    init_console() {  
        var ascendant = this
        /* Do the keypress magic like a real console, but later
            keypress(process.stdin);
                // listen for the "keypress" event
                process.stdin.on('keypress', function (ch, key) {
                console.log('got "keypress"', key);
                if (key && key.ctrl && key.name == 'd') {
                    process.stdout.write("Exiting FXCM Console...")
                    process.stdin.pause()
                    process.exit();
                }
            });

        //process.stdin.setRawMode(true);
        //process.stdin.resume();
        */
        process.stdin.on('data', function (data)  {
                      
            var input = data.toString().trim();
            var split = input.search('{');
            if (split === -1) {
                split = input.length;
            }
            const command = input.substr(0, split).trim();
            var params = input.substr(split).trim();
            const _fxcmClient = ascendant._client;
            ascendant.commands.set(ascendant.commands.size + 1, input)
            
            // if the line was empty we don't want to do anything
            switch (command)  {
                case 'help':
                    process.stdout.write('Help is on the way!\r\n')
                    break;
                case 'history': 
                    var history = "Command History:\r\n" 
                    ascendant.commands.forEach((value, key) => { history += value + "\r\n" }) 
                    process.stdout.write(history + "\r\n" + "Press return to continue..")
                    break;
                case 'exit': 
                    process.stdout.write("I'm out, bye!")
                    process.exit()    
                    break;
                case 'live':
                    console.log(`Live rates for currency pair(${params}):` )
                    fxcmClient.subscribeLiveRates(params)
                    break;
                case 'accounts':
                    fxcmClient.getAccounts()
                    break;
                case 'products':
                    fxcmClient.getProducts()
                    break;
                case 'orderbook':
                    fxcmClient.getProductOrderBook()
                    break; 
                case 'send':
                    // command must be registered with cli
	                if (params.length > 0) {
                        params = JSON.parse(params)
                        try {
                            
                            ascendant.makeRequest(params.method, params.resource, params.params, params.callback);
                            
                        } catch (e) {
                            console.log('could not parse JSON parameters: ', e);
                        }
                    } else {
                        _fxcmClient.emit(command, {});
                    }
                    _fxcmClient.emit('prompt');
                    break;
                default: 
                    if (_fxcmClient.eventNames().indexOf(command) < 0) {
                         console.log("Command not recognized. Available commands: ", _fxcmClient.eventNames())
                        _fxcmClient.emit('prompt');
                    }
                    return;
            }

        });
       
        this._client.on('prompt', (arg = '') => {
            readline.clearLine(process.stdout, 0)
            readline.cursorTo(process.stdout, 0, null);
            process.stdout.write('fxcm:> ' + arg);
        })

        this._client.on('exit', () => {
            process.exit();
        });

        // loading of extra modules
        this._client.on('load', (params) => {
            if (typeof(params.filename) === 'undefined') {
                console.log('command error: "filename" parameter is missing.')
            } else {
                var test = require(`./${params.filename}`);
                test.init(cli,socket);
            }
        });
        /*
        // helper function to send parameters in stringified form, which is required by FXCM REST API
        this._client.on('send', (params) => {
            if (typeof(params.params) !== 'undefined') {
                params.params = querystring.stringify(params.params);
            }
            ascendant._client.emit('send_raw', params);
        });
        */
        // will send a request to the server
        this._client.on('send_raw', (params) => {
            // avoid undefined errors if params are not defined
            if (typeof(params.params) === 'undefined') {
                params.params = '';
            }
            // method and resource must be set for request to be sent
            if (typeof(params.method) === 'undefined') { 
                console.log('command error: "method" parameter is missing.');
            } else if (typeof(params.resource) === 'undefined') {
                console.log('command error: "resource" parameter is missing.');
            } else {
                ascendant.makeRequest(params.method, params.resource, params.params, params.callback);
            }
        });

        /**
         * 
         */
        this._client.on('price_subscribe', (params) => {
            if(typeof(params.pairs) === 'undefined') {
                console.log('command error: "pairs" parameter is missing.');
            } else {
                subscribe(params.pairs);
            }
        });
        /**
         * 
         */
        this._client.on('price_unsubscribe', (params) => {
            if(typeof(params.pairs) === 'undefined') {
                console.log('command error: "pairs" parameter is missing.');
            } else {
                unsubscribe(params.pairs);
            }
        });
       
    }   
    
    get(...args) {
        return this.makeRequest('get', ...args);
    }
    put(...args) {
        return this.makeRequest('put', ...args);
    }
    post(...args) {
        return this.makeRequest('post', ...args);
    }
    delete(...args) {
        return this.makeRequest('delete', ...args);
    }
    
    getProducts(callback) { 
        return this.get(['trading/get_instruments'], callback);
    }

    getAccounts(callback) { 
        
        return this.get(['trading/get_model'], querystring.stringify({"models":["Account"]}), this.callback);
    }

    /**
     * 
     * 
     * Server request maker to FXCM api
     */
    makeRequest(method, resource, params, callback) { console.log(params)
        if (typeof(method) === 'undefined') { 
            method = "GET";
            resource += '/?' + params;
        }
        const ascendant = this;
        let requestID = uuid()
        var req = https.request({ 
            host: this.host,
			port: this.port,
			path: resource, 
			method: method,
			headers: this.request_headers
        }, (response) => {  
                var data = '';
                response.on('data', (chunk) => data += chunk); // re-assemble fragmented response data
                response.on('end', () => {
                    ascendant.callback(response.statusCode, requestID, data);
                });
            }).on('error', (err) => { 
                ascendant.callback(0, requestID, err); // this is called when network request fails
            });

        // non-GET HTTP(S) reuqests pass arguments as data
        if (method !== "GET" && typeof(params) !== 'undefined') {
            req.write(params);
        }
        req.end();
    }
    /**
     * 
     *  The 'callback' to handle socket data
     */
    callback(statusCode, requestID, data) {  
        if (statusCode === 200) {
		try {
			var jsonData = JSON.parse(data);
		} catch (e) {
			console.log('request #', requestID, ' JSON parse error:', e);
			return;
		}
            console.log('request #', requestID, ' has been executed:', JSON.stringify(jsonData, null, 2));
        } else {
            console.log('#', requestID, ': [status: ', statusCode, ', message: ', data, ']');
        }     
    }
    /**
     * Enable FXCM console mode
     */
    enableConsole() { 
        console.log("Initializing fxcm command console.. (Press return to continue)")
        this.showConsole = true
        process.stdin.pause()
        this.init_console();
        process.stdin.resume();
    }

    
}

module.exports =  new FxcmNode()


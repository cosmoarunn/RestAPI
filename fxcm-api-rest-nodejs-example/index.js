"use strict";

const config = require('./config')
const fxcm = require('./fxcm-node')
//console.log(FxcmNode)

//const fxcm = new FxcmNode(config.trading_api_host, config.trading_api_port)
//FxcmNode.host = config.trading_api_host;
//FxcmNode.port  = config.trading_api_port;
fxcm.enableConsole();

//fxcm.authenticate()
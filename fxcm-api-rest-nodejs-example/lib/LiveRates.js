// Small writable stream wrapper that
// passes data to all `candleConsumers`.

const Writable = require('stream').Writable;
const _ = require('lodash');
const async = require('async');
const moment = require('moment');
const Util = require('./util');

var LiveRates = (socket,data = {}) => { 
    this.data = data
    this.candleSize = 0  //0 = ticks or  minute, hour (in seconds)
    this.socket = socket
    this.available = false
    Writable.call(this, {objectMode: true});
    
}
// A writable stream object - useful for storing data/socket emits etc.
LiveRates.prototype = Object.create(Writable.prototype, {
  constructor: { value: LiveRates }
});

LiveRates.prototype.validateResponse = (code, id, data) => { 
    if(!data) return;

    Util.safeParseJSON(data)
}

LiveRates.updateRates = (data) => { 
    if(!data) return;
    const liveRates = Util.safeParseJSON(data)
    liveRates.Rates = liveRates.Rates.map(function(rate){
        return rate.toFixed(5);
    });
    console.log(`@${liveRates.Updated} Price update of [${liveRates.Symbol}]: ${liveRates.Rates}`);
}

LiveRates.prototype.processLiveRates = (pairs) => { 
        
        const callback =  (code, id, data) => { //console.log("calling back with status: "); console.log(data)
            let parsed = Util.safeParseJSON(data); 
            if(!parsed) {
                console.log("Error ("+statusCode+"):" + JSON.stringify(data))
                return;
            }

            //Use a child socket for continuous live subscription once subscribed successfully
            if(parsed.response.executed) {
                try {
					for(var i in parsed.pairs) {
						this.socket.on(parsed.pairs[i].Symbol, updateRates);
					}
				} catch (e) {
					console.log('subscribe request #', requestID, ' "pairs" JSON parse error: ', e);
					return;
				}
            } else { 
				console.log('execution failed: \r\n', parsed);
            }
            
        };

};

LiveRates.prototype.unsubscribe = () => { 
    
};

LiveRates.prototype.responseHandler = (code, id, data) => { 
    if (code === 200 && data) {
        try{
            const parsed = JSON.parse(data);
        }catch (e) {
            console.log('error subscribing live rates:', e);
            return;
        }
    } else { 
        console.log("Error ("+code+"):" + JSON.stringify(data))
        return;
    }
}

LiveRates.prototype.shutdown = function() {

}


module.exports = LiveRates
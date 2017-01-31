"use strict";

var USE_ACTIONS = false;
var READ_FROM_RPC_AT_START = true;

var dgram = require('dgram'),
    rpc = require('node-json-rpc'),
    soef = require('soef');

var g_devices = soef.Devices(),
    socket = null;

var adapter = soef.Adapter (
    main,
    function onUnload (callback) {
        if (socket) {
            socket.close();
            socket = null;
        }
        callback();
    },
    onUpdate,
    { name: 'miele' }
);


function onUpdate(oldVersion, newVersion, callback) {
    if(oldVersion < 28) {
        dcs.delall(callback);
        return;
    }
    callback();
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var ips = [];

ips.init = function () {
    var val = g_devices.getval('IPs');
    if (val) {
        var a = JSON.parse(val);
        for (var i in a) this.push(a[i]);
    }
};


ips.add = function (ip) {
    var idx = this.indexOf(ip);
    if (idx < 0) {
        this.push(ip);
        g_devices.root.setAndUpdate('IPs', JSON.stringify(ips));
    }
    return (idx < 0);
};


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var ZIGBEEPREFIX = 'hdm:ZigBee:';


// function uid2id(uid) {
//     if (uid.indexOf(ZIGBEEPREFIX) !== 0) return uid;
//     return uid.substr(ZIGBEEPREFIX.length);
// }
//
// function id2uid(id) {
//     if (id.indexOf(ZIGBEEPREFIX) === 0) return id;
//     return ZIGBEEPREFIX + id;
// }

var uidRe = new RegExp('^' + ZIGBEEPREFIX + '|^');

function uid2id(uid) {
    return uid.replace(uidRe, '');
}

function id2uid(id) {
    return id.replace(uidRe, ZIGBEEPREFIX);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function startListener(callback) {
    var port = 2810;
    
    socket = dgram.createSocket('udp4');
    socket.bind(port, function () {
        //socket.addMembership('224.255.68.139');
        socket.addMembership('239.255.68.139');
        if (callback) return callback(socket);
    });
    socket.on('message', onMessage);
}

var updateTimer = soef.Timer();

// var updateTimer = {
//     handle: 0,
//     set: function (obj) {
//         if (this.handle) return;
//         this.handle = setTimeout (function () {
//             rpcClients.updateDevice(obj);
//         }, 1000);
//     },
//     clear: function () {
//         if (this.handle) {
//             clearTimeout(this.handle);
//             this.handle = 0;
//         }
//     }
// };


function onMessage(msg, rinfo) {
    if (!msg || !rinfo) return;
    adapter.log.debug("onMessage: " + msg);

    var obj = { ip: rinfo.address },
        as = msg.toString().split('&');
    for (var i in as) {
        var a = as[i].split('=');
        obj[a[0]] = a[1];
    }
    
    if (obj.id.indexOf(ZIGBEEPREFIX) !== 0) return;
    obj.id = uid2id(obj.id);
    
    if (!rpcClients[obj.ip]) {
        rpcClients.add(obj.ip, true);
    } else {
        switch (obj.property) {
            case 'finishTime':
                // wird immer vor duration aufgerufen.
                //updateTimer.set (obj);
                updateTimer.set(function() {
                    rpcClients.updateDevice(obj);
                }, 1000);
                //updateTimer.set(rpcClients.updateDevice.bind(rpcClients), 1000, obj);
                return;
            case 'duration':
            case 'remoteEnabledFlag':
            case 'state':
            default:
        }
        updateTimer.clear();
        rpcClients.updateDevice(obj);
    }
}

var mieleStates = {
    1: 'STATE_OFF',
    2: 'STATE_STAND_BY',
    3: 'STATE_PROGRAMMED',
    4: 'STATE_PROGRAMMED_WAITING_TO_START',
    5: 'STATE_RUNNING',
    6: 'STATE_PAUSE',
    7: 'STATE_END_PROGRAMMED',
    8: 'STATE_FAILURE',
    9: 'STATE_PROGRAMME_INTERRUPTED',
    10: 'STATE_IDLE',
    11: 'STATE_RINSE_HOLD',
    12: 'STATE_SERVICE',
    13: 'STATE_SUPERFREEZING',
    14: 'STATE_SUPERCOOLING',
    15: 'STATE_SUPERHEATING',
    144: 'STATE_DEFAULT',
    145: 'STATE_LOCKED',
    146: 'STATE_SUPERCOOLING_SUPERFREEZING'
};


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var rpcClients = {};

rpcClients.updateDevice = function(obj) {
    this[obj.ip].updateDevice(obj.id);
};

rpcClients.getClient = function (ip) {
    if (this.has(ip)) return this[ip];
    this[ip] = new RPCClient(ip);
    return this[ip];
};

rpcClients.has = function (ip) {
    return this.hasOwnProperty(ip);
};

rpcClients.add = function (ip, read, callback) {
    if (!this.has(ip)) {
        ips.add(ip);
        this[ip] = new RPCClient(ip, read, callback);
        return true;
    }
    return false;
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function RPCClient(ip, read, callback) {
    
    rpc.Client.call(this, { port: 80, host: ip, path: '/remote/json-rpc' /*,ssl: null*/ });
    
    if (typeof read === 'function') {
        callback = read;
        read = true;
    }
    if (read === undefined) read = true;

    var that = this,
        call_id = 1,
        base_call = this.call;

    this.call = function (method, params, callback) {
        var req = { jsonrpc: "2.0", method: method, params: params, id: call_id++ };
        base_call (req, function (err, data) {
            if (err || !data) return callback(err, 0);
            callback(err, data.result);
        });
    };
    
    this.init = function (callback) {
        
        that.call('system.listMethods', [], function (err, result) {
            if (err || !result) return callback ? callback(-1) : 0;

            result.forEach(function(functionName) {
                that[functionName.replace(/\W/g, '_')] = function () {
                    var params = [];
                    for (var i = 0; i < arguments.length; i++) params.push(arguments[i]);
                    var callback = params.pop();
                    that.call(functionName, params, callback);
                }
            });
            adapter.log.debug(result.length + ' functions attached');
            
            if (callback) callback(0);
        });
    };
    
    this.invokeOperation = function (uid, modelID, cmd /*'start' oder 'stop'*/, callback) {
        // TODO...
        // modelID: MieleWashingMachine?
        this.HDAccess_invokeDCOOperation(
            "hdm:ZigBee:" + uid,
            "com.miele.xgw3000.gateway.hdm.deviceclasses.Miele" + modelID,
            cmd,
            null,
            function (err, result) {
                callback(err, result);
            }
        );
    };
    
    function getSuperVisionDeviceClass(dcos) {
        if (dcos) for (var i = 0; i < dcos.length; i++) {
            if (dcos[i].DeviceClass.indexOf("com.miele.xgw3000.gateway.hdm.deviceclasses") == 0) {
                return dcos[i];
            }
        }
        return null;
    }
    
    this.updateDevice = function (uid, callback, doUpdate) {
        if(typeof this.HDAccess_getDeviceClassObjects !== 'function') {
            return callback && callback(-1);
        }
        this.HDAccess_getDeviceClassObjects(id2uid(uid), true, function (err, result) {
            if (err || !result) {
                return callback && callback(-1);
            }
            var stateValueName = '';
            var dco = getSuperVisionDeviceClass(result);
            var showName = dco.Properties[3].Metadata['LocalizedValue'];
            adapter.log.debug('HDAccess_getDeviceClassObjects called. showName: ' + showName);
            var dev = new CDevice(uid2id(uid), showName);
            if (dco && dco.Properties && dco.Properties.length >= 6) {
                dco.Properties.forEach(function (prop) {
                    switch (prop.Name) {
                        case "events":
                        case 'extendedDeviceState':
                        case 'brandId':
                        case 'companyId':
                        case 'productTypeId':
                        case 'specificationVersion':
                        case 'processAction':
                        case 'tunnelingVersion':
                            break;
                        case 'state':
                            stateValueName = mieleStates[prop.Value];
                        default:
                            dev.setState(prop);
                            break;
                    }
                });
                
                // for (var i = 0; i < dco.Properties.length; i++) {
                //     switch (dco.Properties[i].Name) {
                //         case "events":
                //         case 'extendedDeviceState':
                //         case 'brandId':
                //         case 'companyId':
                //         case 'productTypeId':
                //         case 'specificationVersion':
                //         case 'processAction':
                //         case 'tunnelingVersion':
                //             break;
                //         case 'state':
                //             stateValueName = mieleStates[dco.Properties[i].Value];
                //         default:
                //             dev.setState(dco.Properties[i]);
                //             break;
                //     }
                // }
            }
            dev.setChannel();
            dev.set('', stateValueName, showName);
            if (doUpdate !== false) dev.update(callback);
            else callback(0);
        });
    };

    this.readHomeDevices = function (callback) {
        this.HDAccess_getHomeDevices('(type=SuperVision)', function (err, results) {
            if (!results) return safeCB(callback, -1);
            forEachCB(results.length,
                function(cnt, doit) {
                    that.updateDevice(results[cnt].UID, doit, false);
                },
                function(err) {
                    g_devices.update(callback);
                }
            );
        });
    };
    
    this.init(function (err) {
        if (err || !read) return callback && callback(err);
        that.readHomeDevices(callback);
    });

}


function CDevice(name, showName, list) {
    g_devices.CDevice.call(this, name, showName, list);

    this.setState = function (name, value) {
        if (typeof name == 'object') {
            var showName = name.Metadata['description'];
            this.set('states.' + name.Name, name.Value, showName);
            if (name.Metadata['LocalizedValue']) {
                var n = name.Metadata['LocalizedID'] ? name.Metadata['LocalizedID'] : name.Name;
                this.set('localizedStates' + '.' + n, name.Metadata['LocalizedValue'], showName);
            }
            return;
        }
        this.set('states.' + name, value);
    }

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function main() {
    
    if (adapter.config.ip) ips.add(adapter.config.ip);
    ips.init();
    ips.forEach(function(ip) {
        rpcClients.add(ip, READ_FROM_RPC_AT_START);
    });
    startListener();
    
    if (USE_ACTIONS) {
        adapter.subscribeStates('*');
    }
}


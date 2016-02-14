"use strict";

const USE_ACTIONS = false;
//const READ_FROM_RPC_AT_START = false;
const READ_FROM_RPC_AT_START = true;

var utils = require(__dirname + '/lib/utils'),
    dgram = require('dgram'),
    rpc = require('node-json-rpc');

var soef = require(__dirname + '/lib/soef'),
    g_devices = soef.Devices();

var socket = null;
var adapter = utils.adapter({
    name: 'miele',
    
    unload: function (callback) {
        try {
            if (socket) socket.close();
            callback();
        } catch (e) {
            callback();
        }
    },
    discover: function (callback) {
        adapter.log.info("adapter miele discovered");
    },
    install: function (callback) {
        adapter.log.info("adapter miele installed");
    },
    uninstall: function (callback) {
        adapter.log.info("adapter miele uninstalled");
    },
    //objectChange: function (id, obj) {
    //    //adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
    //},
    //stateChange: function (id, state) {
    //    //adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));
    //},
    ready: function () {
        main();
    }
});


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var ips = [];

ips.init = function (callback) {
    var self = this;
    adapter.getState("IPs", function (err, obj) {
        if (err || !obj) return callback(-1);
        var a = JSON.parse(obj.val);
        for (var i in a) self.push(a[i]);
        if (callback) callback(0);
    });
}

ips.add = function (ip) {
    var idx = this.indexOf(ip);
    if (idx < 0) {
        this.push(ip);
        adapter.setState("IPs", JSON.stringify(ips), true);
    }
    return (idx < 0);
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const ZIGBEEPREFIX = 'hdm:ZigBee:';

function uid2id(uid) {
    if (uid.indexOf(ZIGBEEPREFIX) !== 0) return uid;
    return uid.substr(ZIGBEEPREFIX.length);
}

function id2uid(id) {
    if (id.indexOf(ZIGBEEPREFIX) === 0) return id;
    return ZIGBEEPREFIX + id;
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function startListener(callback) {
    var port = 2810;
    
    socket = dgram.createSocket('udp4');
    socket.bind(port, function () {
        // XML
        //socket.addMembership('224.255.68.139'); 

        // ZIGBEEPREFIX
        socket.addMembership('239.255.68.139');
        if (callback) return callback(socket);
    });
    socket.on('message', onMessage);
}

function onMessage(msg, rinfo) {
    if (!msg || !rinfo) return;
    adapter.log.debug("onMessage: " + msg);

    var obj = {},
        as = msg.toString().split('&'),
        ip = rinfo.address;
    for (var i in as) {
        var a = as[i].split('=');
        obj[a[0]] = a[1];
    }
    
    if (obj.id.indexOf(ZIGBEEPREFIX) !== 0) return;
    obj.id = uid2id(obj.id);
    
    if (!g_devices.has(obj.id)) {
        if (!rpcClients.add(ip)) rpcClients[rinfo.address].updateDevice(obj.id);
    } else {
        switch (obj.property) {
            case 'duration':
            case 'remoteEnabledFlag':
            case 'state':
            case 'finishTime':
            default:
        }
        rpcClients[ip].updateDevice(obj.id);
    }
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var rpcClients = {};

rpcClients.getClient = function (ip) {
    if (this.hasOwnProperty(ip)) return this[ip];
    var client = new rpcClient(ip);
    this[ip] = client;
    return this[ip];
}

rpcClients.has = function (ip) {
    return this.hasOwnProperty(ip);
}

rpcClients.add = function (ip, read, callback) {
    ips.add(ip);
    if (!this.has(ip)) {
        var client = new rpcClient(ip, read, callback);
        this[ip] = client;
        return true;
    }
    return false;
}

function rpcClient(ip, read, callback) {
    
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
    }
    
    this.init = function (callback) {
        
        that.call('system.listMethods', [], function (err, result) {
            if (err || !result) return callback ? callback(-1) : 0;
            
            for (var i = 0; i < result.length; i += 1) {
                attach(result[i]);
            }
            
            function attach(functionName) {
                that[functionName.replace(/\W/g, '_')] = function () {
                    var params = []; 
                    for (var i = 0; i < arguments.length; i++) params.push(arguments[i]);
                    var callback = params.pop();
                    that.call(functionName, params, callback);
                }
            }
            
            if (callback) callback(0);
        });
    }
    
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
    }
    
    function getSuperVisionDeviceClass(dcos) {
        if (dcos) for (var i = 0; i < dcos.length; i++) {
            if (dcos[i].DeviceClass.indexOf("com.miele.xgw3000.gateway.hdm.deviceclasses") == 0) {
                return dcos[i];
            }
        }
        return null;
    }
    
    this.readInfo = function (uid, list, callback) {
        this.HDAccess_getDeviceClassObjects(id2uid(uid), true, function (err, result) {
            if (err || !result) return callback(-1);
            var dco = getSuperVisionDeviceClass(result);
            if (dco && dco.Properties && dco.Properties.length >= 6) {
                var dev = new CState(uid2id(uid), dco.Properties[3].Metadata['LocalizedValue'], list);
                //var dev = new g_devices.CState(uid2id(uid), dco.Properties[3].Metadata['LocalizedValue']);
                for (var i = 0; i < dco.Properties.length; i++) {
                    switch (dco.Properties[i].Name) {
                        case "events":
                        case 'extendedDeviceState':
                        case 'brandId':
                        case 'companyId':
                        case 'productTypeId':
                        case 'specificationVersion':
                        case 'processAction':
                        case 'tunnelingVersion':
                            break;
                        default:
                            dev.setState(dco.Properties[i])
                            break;
                    }
                }
            }
            callback(0);
        });
    }
    
    this.updateDevice = function (id, callback) {
        var list = {};
        this.readInfo(id, list, function (err) {
            if (err || !list) return;
            g_devices.update(list, callback);
        });
    }
    
    this.readHomeDevices = function (callback) {
        
        this.HDAccess_getHomeDevices('(type=SuperVision)', function (err, results) {
            if (!results) return callback(-1);
            for (var i = 0; i < results.length; i++) {
                that.updateDevice(results[i].UID);
            }
            if (callback) callback(0);
            return;
            
        //    var cnt = 0;
        //    function add() {
        //        if (cnt < results.length) {
        //            g_devices.readInfo(results[cnt].UID, g_devices.states, function (err, device) {
        //                cnt++;
        //                setTimeout(add, 0);
        //            });
        //            return;
        //        //client.HDAccess_getHomeDevice(devices[cnt].UID, function(err, result) {
        //        //    console.log("" + JSON.stringify(result));
        //        //})
        //        }
        //        g_devices.createAll(callback);
        //    }
            
        //    add();
        });
    }
    
    this.init(function (err) {
        if (read) that.readHomeDevices(callback);
    });

}


function CState(name, showName, list) {
    g_devices.CState.call(this, name, showName, list);

    this.setState = function (name, value) {
        if (typeof name == 'object') {
            var showName = name.Metadata['description'];
            this.add('states.' + name.Name, name.Value, showName);
            if (name.Metadata['LocalizedValue']) {
                var n = name.Metadata['LocalizedID'] ? name.Metadata['LocalizedID'] : name.Name;
                //var s = this.name + '.' + 'localizedStates' + '.' + n;
                this.add('localizedStates' + '.' + n, name.Metadata['LocalizedValue'], showName);
            }
            return;
        }
        this.add('states.' + name, value);
    }

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function main() {
    
    g_devices.init(adapter, function (err) {
        if (adapter.config.ip) ips.add(adapter.config.ip);
        ips.init(function (err) {
            for (var i = 0; i < ips.length; i++) {
                rpcClients.add(ips[i], READ_FROM_RPC_AT_START);
            }
            startListener();
        });
    });
    
    if (USE_ACTIONS) {
        adapter.subscribeStates('*');
    }
}


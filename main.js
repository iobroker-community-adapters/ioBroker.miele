"use strict";

const USE_ACTIONS = false;

var utils = require(__dirname + '/lib/utils'),
    dgram = require('dgram'),
    http = require('http'),
    parseURL = require('url').parse,
    parseString = require('xml2js').parseString;

var adapter = utils.adapter('miele');

var defaultIP = '192.168.1.42';
var inMemDevices = [];
var socket = null;

const tr = { '\u00e4': 'ae', '\u00fc': 'ue', '\u00f6': 'oe', '\u00c4': 'Ae', '\u00d6': 'Oe', '\u00dc': 'Ue', '\u00df': 'ss' };

function Device(device) {
    this.infos = {};
    this.actions = {};
    this.name = device.name.replace(/[\u00e4\u00fc\u00f6\u00c4\u00d6\u00dc\u00df]/g, function ($0) { return tr[$0] });
    this.id = device.UID;
    this.url = device.url;
    this.state = false | device.state;
    //this.additionalName: device.additionalName,
}


Device.prototype.putInfo = function (info) {
    this.infos[info.name] = info.value;
}

if (USE_ACTIONS) {
    Device.prototype.putAction = function (action, idx) {
        this.actions[action.name] = action.URL;
    }
}


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


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

inMemDevices.getDeviceIdx = function (id) {
    return typeof id === 'number' ? id : this[id];
}

inMemDevices.getDevice = function (id) {
    return this[this.getDeviceIdx(id)];
}

inMemDevices.setDevice = function (device) {
    if (this.hasOwnProperty(device.id)) {
        this[this[device.id]] = device;
    } else {
        this[device.id] = this.length;
        this.push(device);
    }
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function setObject(device, name, callback) {
    adapter.setObject(device.name + '.' + name, {
        type: 'state',
        common: {
            name: name,
            role: 'state',
            type: 'string',
            write: false,
        },
        native: {}
    }, callback);
}

function setState(device /* or Number */, name, val) {
    if ((typeof device === 'number') || (typeof device === 'string'))
        device = inMemDevices.getDevice(device);
    if (typeof device !== 'object') return;
    if (val === undefined) val = device.infos[name];
    adapter.setState(device.name + '.' + name, { val: val, ack: true });
    //adapter.setState(device.name + '.' + name, { val: val, ack: true }, function (err, obj) {
    //    if (err || !obj || (typeof obj !== 'string')) return;
    //    setObject(device, name);
    //});
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

adapter.on('unload', function (callback) {
    try {
        if (socket) socket.close();
        callback();
    } catch (e) {
        callback();
    }
});

//adapter.on('objectChange', function (id, obj) {
//    // Warning, obj can be null if it was deleted
//    //adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
//});

if (USE_ACTIONS) {
    adapter.on('stateChange', function (id, state) {
        // Warning, state can be null if it was deleted
        //adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));
        //if (state && !state.ack) {
        //    adapter.log.info('ack is not set!');
        //}
    });
}

adapter.on('ready', function () {
    main();
});


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function onMessage(msg, rinfo) {
    if (!msg || !rinfo) return;
    adapter.log.debug("onMessage: " + msg);

    var obj = {},
        as = msg.toString().split('&');
    for (var i in as) {
        var a = as[i].split('=');
        obj[a[0]] = a[1];
    }

    if (!inMemDevices.hasOwnProperty(obj.id)) {
        getDevicesAndInfo(rinfo.address, function (err) {
        })
    } else {
        var device = inMemDevices.getDevice(obj.id);
        switch (obj.property) {
            case 'duration':
                //var device = inMemDevices.getDevice(obj.id);
                var val = false | obj.value;
                //setState(device, "Dauer", parseInt(val / 60) + ':' + (val % 60));     // Restzeit
                setState(device, "Restzeit", parseInt(val / 60) + ':' + (val % 60));     // Restzeit
                setState(device, "Endzeit", val);
                break;
            case 'remoteEnabledFlag':
                setState(device, "remoteEnabledFlag", false | obj.val);
                break;
            case 'state':
            case 'finishTime':
            default:
                checkStatusChange(rinfo.address, obj.id, function (err) {
                });
        }
    }
}

function startListener(callback) {
    var port = 2810;

    socket = dgram.createSocket('udp4');
    socket.bind(port, function () {
        socket.addMembership('224.255.68.139');
        //socket.addMembership('239.255.68.139');
        if (callback) return callback(socket);
    });
    socket.on('message', onMessage);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function getHTTP(ip, path, callback) {
    if (!ip) return callback(-1);

    return http.get({ host: ip, path: path }, function (response) {
        var body = '';
        response.on('data', function (d) {
            body += d;
        });
        response.on('end', function () {
            parseString(body, {mergeAttrs: true, explicitArray: false}, callback);
        });
    });
}


function checkStatusChange(ip, id, callback, force) {
    var device = inMemDevices.getDevice(id);
    getHTTP(ip, device.url, function (err, result) {
        var keys = result.device.information.key
        for (var i = 0; i < keys.length; i++) {
            var name = keys[i].name,
                val = keys[i].value;
            if ((device.infos[name] !== val) || (0 | force)) {
                device.infos[name] = val;
                setState(device, name, val);
            }
        }
        if (callback) callback(0);
    });
}


function updateAllStates(ip, callback) {
    if (!ip) return callback(-1);
    var cnt = 0;
    function update() {
        if (cnt < inMemDevices.length) {
            checkStatusChange(ip, cnt, function (err) {
                cnt++;
                setTimeout(update, 0);
            }, true);
        } else if (callback) callback(0);
    }
    update();
}

function getDevices(ip, callback) {
    
    adapter.log.debug("getDevices, ip=" + ip);
    getHTTP(ip, '/homebus', function (err, result) {
        if (err || !result) return callback(-1);
        
        var devcnt = result.DEVICES.device.length;
        for (var i in result.DEVICES.device) {
            var device = result.DEVICES.device[i];
            device.url = parseURL(device.actions.action.URL).path;
            inMemDevices.setDevice(new Device(device));            ;
            
            if (((false | i) + 1 === devcnt) && callback) {
                return callback(0);
            }
        }
    })
}


function getDeviceStatus(ip, callback) {
    
    adapter.log.debug("getDeviceStatus: ip=" + ip);
    var cnt = 0;
    
    function getInfo() {
        if (cnt < inMemDevices.length) {
            adapter.log.debug("getDeviceStatus: ip=" + ip + " name=" + inMemDevices[cnt].name + " id=" + inMemDevices[cnt].id);
            getHTTP(ip, inMemDevices[cnt].url, function (err, result) {

                if (err || !result) return callback(-1);
                adapter.log.debug("http-result: " + JSON.stringify(result));
                var keys = result.device.information.key;
                for (var i = 0; i < keys.length; i++) {
                    //adapter.log.debug("key: name=" + keys[ii].name + " val=" + keys[ii].value);
                    inMemDevices[cnt].putInfo(keys[i]);
                }

                inMemDevices[cnt].putInfo({ name: "Restzeit", value: "" });
                inMemDevices[cnt].putInfo({ name: "remoteEnabledFlag", value: "" });
                if (USE_ACTIONS) {
                    var actions = result.device.actions.action;
                    if (actions.hasOwnProperty('length')) for (var i = 0; i < actions.length; i++) {
                        inMemDevices[cnt].putAction(actions[i]);
                    } else inMemDevices[cnt].putAction(actions);
                }
                
                cnt++;
                setTimeout(getInfo, 0)
            });
        } else {
            if (callback) callback(0);
        }
    }
    
    getInfo();
}


function createDevice(id, callback) {
    adapter.log.debug("createDevice: id=" + id);
    var device = inMemDevices.getDevice(id);
    if (!device) return;
    var states = [];
    
    function addAction() {
        if (USE_ACTIONS) {
            if (cnt < device.action.length) {

            }
        }
        if (callback) callback(0);
    }
    
    function addState() {
        if (states.length) {
            var name = states.pop();
            setObject(device, name, function (err, obj) {
                adapter.log.debug("Object " + obj.id + " created, val=" + device.infos[name]);
                setState(device, name);
                setTimeout(addState(), 0);
            });
        } else {
            addAction();
        }
    }
    
    adapter.setObjectNotExists(device.name, {
        type: 'device', 
        common: {
            name: device.id, 
            role: 'device'
        }
    }, function (err, obj) {
        adapter.log.debug("Device " + obj.id + " created, adding States...")
        for (var i in device.infos) states.push(i);
        addState();
    });
}


function getDevicesAndInfo(ip, callback) {
    if (!ip) return callback(-1);
    ips.add(ip);
    adapter.log.debug("getDevicesAndInfo: ip=" + ip);
    getDevices(ip, function (err, result) {
        getDeviceStatus(ip, function (err, result) {
            for (var i = 0; i < inMemDevices.length; i++) createDevice(inMemDevices[i].id);
            if (callback) callback(0);
        });
    });
}




function main() {
    
    if (adapter.config.ip) ips.add(adapter.config.ip);   
    
    ips.init(function (err) {
        if (ips[0]) getDevicesAndInfo(ips[0], function (err) {
            updateAllStates(ips[0], function (err) {
            });
        });
    });
    
    startListener();
    if (USE_ACTIONS) {
        adapter.subscribeStates('*');
    }
}


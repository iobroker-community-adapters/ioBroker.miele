/**
 tools for an ioBroker Adapter v0.0.0.1

 Copyright (c) 2016 soef <soef@gmx.net>
 All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:
 * Redistributions of source code must retain the above copyright
 notice, this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright
 notice, this list of conditions and the following disclaimer in the
 documentation and/or other materials provided with the distribution.
 * Neither the name of sprintf() for JavaScript nor the
 names of its contributors may be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 DISCLAIMED. IN NO EVENT SHALL Alexandru Marasteanu BE LIABLE FOR ANY
 DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


 Changelog:
 2016-01-13 - 0.0.0.3 fixed errors of initial reeaase
 ...

 2016.01.10 - 0.0.0.1 initial release
 */


"use strict";

const g_Role = ['device', 'channel', 'state'];
const g_Type = ['device', 'channel', 'state'];


function errmsg () { console.log("adapter not assigned, use Device.setAdapter(yourAdapter)") };


function valtype(val) {
    switch (val) {
        //fastest way for most states
        case 'true': return true;
        case 'false': return false;
        case '0': return 0;
        case '1': return 1;
        case '2': return 2;
        case '3': return 3;
        case '4': return 4;
        case '5': return 5;
        case '6': return 6;
        case '7': return 7;
        case '8': return 8;
        case '9': return 9;
    }
    var number = parseInt(val);
    if (number.toString() === val) return number;
    var float = parseFloat(val);
    if (float.toString() === val) return float;
    return val;
}


function Devices (_adapter, _callback) {

    var that = this;
    this.states = {};
    this.adapter = {
        setState: errmsg,
        setObject: errmsg,
        setObjectNotExists: errmsg,
        getStates: errmsg
    };

    this.setAdapter = function (adapter) {
        this.adapter = adapter;
    }

    this.has = function (id, prop) {
        var b = this.states.hasOwnProperty(id);
        if (prop === undefined) return b;
        return (b && this.states[id] !== null && this.states[id].hasOwnProperty(prop));
    }
    this.existState = function (id) {
        return (this.has(id, 'exist') && this.states[id].exist === true);
    };
    this.setExist = function (id, val) {
        val = val || true;
        if (!this.has(id)) this.states[id] = { exist: val }
        else this.states[id].exist = val;
    }
    this.showName = function (id, name) {
        return ((this.states.hasOwnProperty(id) && this.states[id].showName) ? this.states[id].showName : name);
    };

    this.foreach = function (pattern, callback) {
        //TODO...
        for (var i in this.states) {
            if (i.indexOf(pattern) == 0) callback(i, this.states[i]);
        }
    }

    this.stateChanged = function (id, val, ack) {
    };

    this.setState = function (id, val, ack) {
        if (val !== undefined) this.states[id].val = val
        else val = this.states[id].val;
        ack = ack || true;
        this.adapter.setState(id, val, ack);
        this.stateChanged(id, val, ack);
    };

    this.setStateEx = function (id, newObj, ack, callback) {
        if (typeof ack === 'function') { callback = ack; ack = true }
        if (typeof newObj !== 'object') { newObj = { val: newObj }};
        if (ack === undefined) ack = true;
        if (!that.has(id)) {
            that.states[id] = newObj;
            that.create(id, callback);
        } else {
            if (that.states[id].val !== newObj.val) that.setState(id, newObj.val, ack);
            if (callback) callback(0);
        }
    };

    this.extendObject = function (fullName, obj) {
        return obj;
    };

    this.createObject = function (fullName, name, roleNo, callback) {
        var obj = {
            type: g_Type[roleNo],
            common: {
                name: name,
                role: g_Role[roleNo],
                type: 'string'
            },
            native: {}
        };
        if (this.has(fullName)) {
            var o = this.states[fullName];
            if (o.hasOwnProperty ('type')) obj.type = o.type;
            if (o.hasOwnProperty('val')) {
                obj.common.type = typeof o.val;
                obj.common.role = 'state';
                obj.type = 'state';
            }
            if (o.hasOwnProperty('showName')) obj.common.name = o.showName;
        }
        obj = this.extendObject(fullName, obj);
        this.adapter.setObject/*NotExists*/(fullName, obj, callback);
    };

    this.create = function (id, callback) {
        var as = id.split('.');
        var cnt = 0, fullName = '';

        function doIt() {
            if (cnt < as.length) do {
                if (fullName) fullName += '.';
                fullName += as[cnt];
            } while (that.existState(fullName) && ++cnt < as.length);

            if (cnt < as.length) {
                that.setExist(fullName);
                that.createObject(fullName, as[cnt], cnt, function (err, obj) {
                    that.setExist(fullName);
                    cnt++;
                    if (cnt == as.length && that.has(fullName, 'val')) {
                        that.setState(fullName);
                    }
                    setTimeout(doIt, 0);
                });
            } else {
                if (callback) callback(0);
            }
        }
        doIt();
    };

    this.createAll = function (callback) {
        var states = [];
        for (var i in this.states) {
            if (!this.existState(i)) states.push(i);
        }
        function add() {
            if (states.length > 0) {
                var i = states.shift();
                that.create(i, function (err) {
                    setTimeout(add, 0);
                });
            } else {
                if (callback) callback(0);
            }
        }
        add();
    };

    this.update = function (list, callback) {
        if (!list) return callback(-1);
        if (list instanceof Array) {
            for (var i=0; i<list.length; i++) {
                var objName = Object.keys( list[i] )[ 0 ];
                this.setStateEx(objName, list[i][objName]);
            }
        } else {
            for (var id in list) {
                this.setStateEx(id, list[id]);
            }
        }
        if (callback) callback(0);
    };

    this.updateSync = function (list, callback) {
        if (!list) return;
        if (list instanceof Array) {
            return callback(-1);
        }
        var states = [];
        for (var i in list) {
            if (!that.existState(i)) states.push(i);
        }
        function setState() {
            if (states.length > 0) {
                var id = states.shift();
                that.setStateEx(id, list[id], true, function (err) {
                    setTimeout(setState, 0);
                })
                return;
            }
            if (callback) callback(0);
        }
        setState();
    };

    this.readAllExistingObjects = function (callback) {
        //var that = this;
        //adapter.getStatesOf(function (err, objs) {
        //    if (objs) {
        //        for (var i = 0; i < objs.length; i++) {
        //            objects[objs[i]._id] = objs[i];
        //        }
        //    }
        //});
        //return;
        //adapter.getDevices(function(err, devices) {
        //});

        //adapter.objects
        //adapter.states
        //adapter.getStates("Waeschetrockner.*", {}, function (err, states) {
        this.adapter.getStates("*", {}, function (err, states) {
            if (err || !states) return callback(-1);
            var namespacelen = that.adapter.namespace.length + 1;
            for (var fullId in states) {
                var id = fullId.substr(namespacelen);
                that.states[id] = {
                    exist: true,
                    val: states[fullId].val,
                }
            }

            if (callback) callback(0);
        });
    };


    this.CState = function CState (name, showName, list) {

        const tr = { '\u00e4': 'ae', '\u00fc': 'ue', '\u00f6': 'oe', '\u00c4': 'Ae', '\u00d6': 'Oe', '\u00dc': 'Ue', '\u00df': 'ss' };
        var channel = "";
        this.list = (list === undefined) ? {} : list;

        this.setDevice = function (name, options) {
            if (name === undefined) return;
            this.name = name.replace(/[\u00e4\u00fc\u00f6\u00c4\u00d6\u00dc\u00df]/g, function ($0) {
                return tr[$0]
            });
            this.list [name] = {};
            if (options) for (var i in options) this.list[name][i] = options[i];
            channel = "";
        }
        this.setDevice(name, { showName: showName} );

        this.setChannel = function (name, showName) {
            if (name === undefined) channel = ""
            else {
                channel = '.' + name;
                if (showName) this.list[this.name + channel] = { showName: showName }
            }
        }

        this.add = function (name, valOrObj, showName) {
            if (valOrObj === null) return;
            if (typeof valOrObj === 'object') {
                var obj = valOrObj;
            } else {
                obj = {};
                if (valOrObj !== undefined) obj.val = valtype(valOrObj);
            }
            if (showName) obj.showName = showName;
            this.list[this.name + channel + (name ? '.' + name : "")] = obj;
        }

        this.formatValue = function (value, decimals, _format) {
            if (_format === undefined) _format = ".,";
            if (typeof value !== "number") value = parseFloat(value);

            var ret = isNaN(value) ? "" : value.toFixed(decimals || 0).replace(_format[0], _format[1]).replace(/\B(?=(\d{3})+(?!\d))/g, _format[0]);
            return (ret);
        }

        this.setState = function (data, value) {
        }

    }

    this.init = function (adapter, callback) {
        this.setAdapter(adapter);
        this.readAllExistingObjects(callback);
    };

    if (_adapter) this.init(_adapter, _callback);

    return this;
}

exports.Devices = Devices;

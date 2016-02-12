"use strict";

const g_Role = ['device', 'channel', 'state'];
const g_Type = ['device', 'channel', 'state'];


function errmsg () { console.log("adapter not assigned, use Device.setAdapter(yourAdapter)") };

var _Devices = {
    
    states: [],
    adapter: {
        setState: errmsg,
        setObject: errmsg,
        setObjectNotExists: errmsg,
        getStates: errmsg,
    },

    setAdapter: function (adapter) {
        this.adapter = adapter;
    },

    has: function (id) {
        return (this.states.hasOwnProperty(id))
    },
    
    existState: function (id) {
        return (this.states.hasOwnProperty(id) && this.states[id].exist === true);
    },
    showName: function (id, name) {
        return ((this.states.hasOwnProperty(id) && this.states[id].showName) ? this.states[id].showName : name);
    },
    
    setState: function (id, val, ack) {
        if (val !== undefined) this.states[id].val = val
        else val = this.states[id].val;
        ack = ack || true;
        //adapter.setState(id, val, ack);
        this.adapter.setState(id, val, ack);
    },
    
    setStateEx: function (id, newObj, ack, callback) {
        if (typeof ack === 'function') { callback = ack; ack = true }
        if (ack === undefined) ack = true;
        if (!this.has(id)) {
            this.states[id] = newObj;
            this.create(id, callback);
        } else {
            if (this.states[id].val !== newObj.val) this.setState(id, newObj.val, ack);
            if (callback) callback(0);
        }
    },
    
    extendObject: function (fullName, obj) {
        return obj;
    },
    
    createObject: function (fullName, name, roleNo, callback) {
        var obj = {
            type: g_Type[roleNo],
            common: {
                name: name, 
                role: g_Role[roleNo],
                type: 'string',
            },
            native: {}
        };
        obj = this.extendObject(fullName, obj);
        if (this.has(fullName)) {
            var o = this.states[fullName];
            if (o.hasOwnProperty('val')) obj.common.type = typeof o.val;
            if (o.hasOwnProperty('showName')) obj.common.name = o.showName;
        }
        //adapter.setObject/*NotExists*/(fullName, obj, callback);
        this.adapter.setObject/*NotExists*/(fullName, obj, callback);
    },
    
    create: function (id, callback) {
        var as = id.split('.');
        var cnt = 0, fullName = '';
        var that = this;
        
        function doIt() {
            if (cnt < as.length) do {
                if (fullName) fullName += '.';
                fullName += as[cnt];
            } while (that.existState(fullName) && ++cnt < as.length);
            
            if (cnt < as.length) {
                //createObject(fullName, that.showName(fullName, as[cnt]), cnt, function (err, obj) {
                that.createObject(fullName, as[cnt], cnt, function (err, obj) {
                    if (!that.states.hasOwnProperty(fullName)) that.states[fullName] = { exist: true }
                    else that.states[fullName].exist = true;
                    cnt++;
                    if (cnt == as.length && that.states[fullName].hasOwnProperty('val')) {
                        that.setState(fullName);
                    }
                    setTimeout(doIt, 0);
                });
            } else {
                if (callback) callback(0);
            }
        }
        doIt();
    },
    
    createAll: function (callback) {
        var that = this;
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
    },
    
    update: function (list, callback) {
        if (!list) return callback(-1);
        for (var id in list) {
            this.setStateEx(id, list[id]);
        }
        if (callback) callback(0);
    },

    updateSync: function (list, callback) {
        if (!list) return;
        var states = [];
        var that = this;
        for (var i in list) {
            if (!newDevices.existState(i)) states.push(i);
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
    },
    
    readAllExistingObjects: function (callback) {
        var that = this;
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
            for (var i in states) {
                that.states[i] = {
                    exist: true,
                    val: states[i].val,
                }
            }
            if (callback) callback(0);
        });
    },
    
    init: function (adapter, callback) {
        this.setAdapter(adapter);
        this.readAllExistingObjects(callback);
    },
    

}


function Devices (_adapter, _callback) {
    
    var that = this;
    this.states = [];
    this.adapter = {
        setState: errmsg,
        setObject: errmsg,
        setObjectNotExists: errmsg,
        getStates: errmsg,
    };

    this.setAdapter = function (adapter) {
        this.adapter = adapter;
    }
    
    this.has = function (id, prop) {
        var b = this.states.hasOwnProperty(id);
        if (prop === undefined) return b;
        return (b && this.states[id].hasOwnProperty(prop));
    }
    
    this.existState = function (id) {
        return (this.states.hasOwnProperty(id) && this.states[id].exist === true);
    };
    this.showName = function (id, name) {
        return ((this.states.hasOwnProperty(id) && this.states[id].showName) ? this.states[id].showName : name);
    };
    
    //set: function (id, valOrObj, ack) {
    //    var val = valOrObj;
    //    if (typeof valOrObj === 'object') val = valOrObj.val;
    //    this.states[id] = val;
    //},
    
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
        if (!this.has(id)) {
            this.states[id] = newObj;
            this.create(id, callback);
        } else {
            if (this.states[id].val !== newObj.val) this.setState(id, newObj.val, ack);
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
                type: 'string',
            },
            native: {}
        };
        if (this.has(fullName)) {
            var o = this.states[fullName];
            if (o.hasOwnProperty('val')) obj.common.type = typeof o.val;
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
                that.createObject(fullName, as[cnt], cnt, function (err, obj) {

                    if (!that.has(fullName)) that.states[fullName] = { exist: true }
                    //if (!that.states.hasOwnProperty(fullName)) that.states[fullName] = { exist: true }
                    else that.states[fullName].exist = true;
                    cnt++;
                    //if (cnt == as.length && that.states[fullName].hasOwnProperty('val')) {
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
        for (var id in list) {
            this.setStateEx(id, list[id]);
        }
        if (callback) callback(0);
    };
    
    this.updateSync = function (list, callback) {
        if (!list) return;
        var states = [];
        for (var i in list) {
            if (!newDevices.existState(i)) states.push(i);
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
            for (var i in states) {
                that.states[i] = {
                    exist: true,
                    val: states[i].val,
                }
            }
            if (callback) callback(0);
        });
    };
    
    this.init = function (adapter, callback) {
        this.setAdapter(adapter);
        this.readAllExistingObjects(callback);
    };
    
    if (_adapter) this.init(_adapter, _callback);

    return this;
}

exports.Devices = Devices;
exports._Devices = _Devices;

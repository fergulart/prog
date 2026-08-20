var pas = { $libimports: {}};

var rtl = {

  version: 30200,

  quiet: false,
  debug_load_units: false,
  debug_rtti: false,

  $res : {},

  debug: function(){
    if (rtl.quiet || !console || !console.log) return;
    console.log(arguments);
  },

  error: function(s){
    rtl.debug('Error: ',s);
    throw s;
  },

  warn: function(s){
    rtl.debug('Warn: ',s);
  },

  checkVersion: function(v){
    if (rtl.version != v) throw "expected rtl version "+v+", but found "+rtl.version;
  },

  hiInt: Math.pow(2,53),

  hasString: function(s){
    return rtl.isString(s) && (s.length>0);
  },

  isArray: function(a) {
    return Array.isArray(a);
  },

  isFunction: function(f){
    return typeof(f)==="function";
  },

  isModule: function(m){
    return rtl.isObject(m) && rtl.hasString(m.$name) && (pas[m.$name]===m);
  },

  isImplementation: function(m){
    return rtl.isObject(m) && rtl.isModule(m.$module) && (m.$module.$impl===m);
  },

  isNumber: function(n){
    return typeof(n)==="number";
  },

  isObject: function(o){
    var s=typeof(o);
    return (typeof(o)==="object") && (o!=null);
  },

  isString: function(s){
    return typeof(s)==="string";
  },

  getNumber: function(n){
    return typeof(n)==="number"?n:NaN;
  },

  getChar: function(c){
    return ((typeof(c)==="string") && (c.length===1)) ? c : "";
  },

  getObject: function(o){
    return ((typeof(o)==="object") || (typeof(o)==='function')) ? o : null;
  },

  isTRecord: function(type){
    return (rtl.isObject(type) && type.hasOwnProperty('$new') && (typeof(type.$new)==='function'));
  },

  isPasClass: function(type){
    return (rtl.isObject(type) && type.hasOwnProperty('$classname') && rtl.isObject(type.$module));
  },

  isPasClassInstance: function(type){
    return (rtl.isObject(type) && rtl.isPasClass(type.$class));
  },

  hexStr: function(n,digits){
    return ("000000000000000"+n.toString(16).toUpperCase()).slice(-digits);
  },

  m_loading: 0,
  m_loading_intf: 1,
  m_intf_loaded: 2,
  m_loading_impl: 3, // loading all used unit
  m_initializing: 4, // running initialization
  m_initialized: 5,

  module: function(module_name, intfuseslist, intfcode, impluseslist){
    if (rtl.debug_load_units) rtl.debug('rtl.module name="'+module_name+'" intfuses='+intfuseslist+' impluses='+impluseslist);
    if (!rtl.hasString(module_name)) rtl.error('invalid module name "'+module_name+'"');
    if (!rtl.isArray(intfuseslist)) rtl.error('invalid interface useslist of "'+module_name+'"');
    if (!rtl.isFunction(intfcode)) rtl.error('invalid interface code of "'+module_name+'"');
    if (!(impluseslist==undefined) && !rtl.isArray(impluseslist)) rtl.error('invalid implementation useslist of "'+module_name+'"');

    if (pas[module_name])
      rtl.error('module "'+module_name+'" is already registered');

    var r = Object.create(rtl.tSectionRTTI);
    var module = r.$module = pas[module_name] = {
      $name: module_name,
      $intfuseslist: intfuseslist,
      $impluseslist: impluseslist,
      $state: rtl.m_loading,
      $intfcode: intfcode,
      $implcode: null,
      $impl: null,
      $rtti: r
    };
    if (impluseslist) module.$impl = {
          $module: module,
          $rtti: r
        };
  },

  exitcode: 0,

  run: function(module_name){
    try {
      if (!rtl.hasString(module_name)) module_name='program';
      if (rtl.debug_load_units) rtl.debug('rtl.run module="'+module_name+'"');
      rtl.initRTTI();
      var module = pas[module_name];
      if (!module) rtl.error('rtl.run module "'+module_name+'" missing');
      rtl.loadintf(module);
      rtl.loadimpl(module);
      if ((module_name=='program') || (module_name=='library')){
        if (rtl.debug_load_units) rtl.debug('running $main');
        var r = pas[module_name].$main();
        if (rtl.isNumber(r)) rtl.exitcode = r;
      }
    } catch(re) {
      if (!rtl.showUncaughtExceptions) {
        throw re
      } else {  
        if (!rtl.handleUncaughtException(re)) {
          rtl.showException(re);
          rtl.exitcode = 216;
        }  
      }
    } 
    return rtl.exitcode;
  },
  
  showException : function (re) {
    var errStack="";
    if (rtl.isObject(re) && re.hasOwnProperty('FJSError') && rtl.isObject(re.FJSError) && !(re.FJSError.stack==undefined)) // rtl Exception
      errStack=re.FJSError.stack
    else if (rtl.isObject(re) && re.hasOwnProperty('stack') && !(re.stack==undefined)) // native JS Error
      errStack=re.stack
    else
      errStack=re; // unknown object
    var errMsg = rtl.hasString(re.$classname) ? re.$classname : '';
    errMsg += ((errMsg) ? ': ' : '') + (re.hasOwnProperty('fMessage') ? re.fMessage : '');
    errMsg += ((errMsg) ? "\n" : '') + errStack;
    errMsg = "Uncaught Exception:\n" + errMsg;
    console.log(errMsg);
    alert(errMsg);
  },

  handleUncaughtException: function (e) {
    if (rtl.onUncaughtException) {
      try {
        rtl.onUncaughtException(e);
        return true;
      } catch (ee) {
        return false; 
      }
    } else {
      return false;
    }
  },

  loadintf: function(module){
    if (module.$state>rtl.m_loading_intf) return; // already finished
    if (rtl.debug_load_units) rtl.debug('loadintf: "'+module.$name+'"');
    if (module.$state===rtl.m_loading_intf)
      rtl.error('unit cycle detected "'+module.$name+'"');
    module.$state=rtl.m_loading_intf;
    // load interfaces of interface useslist
    rtl.loaduseslist(module,module.$intfuseslist,rtl.loadintf);
    // run interface
    if (rtl.debug_load_units) rtl.debug('loadintf: run intf of "'+module.$name+'"');
    module.$intfcode(module.$intfuseslist);
    // success
    module.$state=rtl.m_intf_loaded;
    // Note: units only used in implementations are not yet loaded (not even their interfaces)
  },

  loaduseslist: function(module,useslist,f){
    if (useslist==undefined) return;
    var len = useslist.length;
    for (var i = 0; i<len; i++) {
      var unitname=useslist[i];
      if (rtl.debug_load_units) rtl.debug('loaduseslist of "'+module.$name+'" uses="'+unitname+'"');
      if (pas[unitname]==undefined)
        rtl.error('module "'+module.$name+'" misses "'+unitname+'"');
      f(pas[unitname]);
    }
  },

  loadimpl: function(module){
    if (module.$state>=rtl.m_loading_impl) return; // already processing
    if (module.$state<rtl.m_intf_loaded) rtl.error('loadimpl: interface not loaded of "'+module.$name+'"');
    if (rtl.debug_load_units) rtl.debug('loadimpl: load uses of "'+module.$name+'"');
    module.$state=rtl.m_loading_impl;
    // load interfaces of implementation useslist
    rtl.loaduseslist(module,module.$impluseslist,rtl.loadintf);
    // load implementation of interfaces useslist
    rtl.loaduseslist(module,module.$intfuseslist,rtl.loadimpl);
    // load implementation of implementation useslist
    rtl.loaduseslist(module,module.$impluseslist,rtl.loadimpl);
    // Note: At this point all interfaces used by this unit are loaded. If
    //   there are implementation uses cycles some used units might not yet be
    //   initialized. This is by design.
    // run implementation
    if (rtl.debug_load_units) rtl.debug('loadimpl: run impl of "'+module.$name+'"');
    if (rtl.isFunction(module.$implcode)) module.$implcode(module.$impluseslist);
    // run initialization
    if (rtl.debug_load_units) rtl.debug('loadimpl: run init of "'+module.$name+'"');
    module.$state=rtl.m_initializing;
    if (rtl.isFunction(module.$init)) module.$init();
    // unit initialized
    module.$state=rtl.m_initialized;
  },

  createCallback: function(scope, fn){
    var cb;
    if (typeof(fn)==='string'){
      if (!scope.hasOwnProperty('$events')) scope.$events = {};
      cb = scope.$events[fn];
      if (cb) return cb;
      scope.$events[fn] = cb = function(){
        return scope[fn].apply(scope,arguments);
      };
    } else {
      cb = function(){
        return fn.apply(scope,arguments);
      };
    };
    cb.scope = scope;
    cb.fn = fn;
    return cb;
  },

  createSafeCallback: function(scope, fn){
    var cb;
    if (typeof(fn)==='string'){
      if (!scope[fn]) return null;
      if (!scope.hasOwnProperty('$events')) scope.$events = {};
      cb = scope.$events[fn];
      if (cb) return cb;
      scope.$events[fn] = cb = function(){
        try{
          return scope[fn].apply(scope,arguments);
        } catch (err) {
          if (!rtl.handleUncaughtException(err)) throw err;
        }
      };
    } else if(!fn) {
      return null;
    } else {
      cb = function(){
        try{
          return fn.apply(scope,arguments);
        } catch (err) {
          if (!rtl.handleUncaughtException(err)) throw err;
        }
      };
    };
    cb.scope = scope;
    cb.fn = fn;
    return cb;
  },

  eqCallback: function(a,b){
    // can be a function or a function wrapper
    if (a===b){
      return true;
    } else {
      return (a!=null) && (b!=null) && (a.fn) && (a.scope===b.scope) && (a.fn===b.fn);
    }
  },

  initStruct: function(c,parent,name){
    if ((parent.$module) && (parent.$module.$impl===parent)) parent=parent.$module;
    c.$parent = parent;
    if (rtl.isModule(parent)){
      c.$module = parent;
      c.$name = name;
    } else {
      c.$module = parent.$module;
      c.$name = parent.$name+'.'+name;
    };
    return parent;
  },

  initClass: function(c,parent,name,initfn,rttiname){
    parent[name] = c;
    c.$class = c; // Note: o.$class === Object.getPrototypeOf(o)
    c.$classname = rttiname?rttiname:name;
    parent = rtl.initStruct(c,parent,name);
    c.$fullname = parent.$name+'.'+name;
    // rtti
    if (rtl.debug_rtti) rtl.debug('initClass '+c.$fullname);
    var t = c.$module.$rtti.$Class(c.$classname,{ "class": c });
    c.$rtti = t;
    if (rtl.isObject(c.$ancestor)) t.ancestor = c.$ancestor.$rtti;
    if (!t.ancestor) t.ancestor = null;
    // init members
    initfn.call(c);
  },

  createClass: function(parent,name,ancestor,initfn,rttiname){
    // create a normal class,
    // ancestor must be null or a normal class,
    // the root ancestor can be an external class
    var c = null;
    if (ancestor != null){
      c = Object.create(ancestor);
      c.$ancestor = ancestor;
      // Note:
      // if root is an "object" then c.$ancestor === Object.getPrototypeOf(c)
      // if root is a "function" then c.$ancestor === c.__proto__, Object.getPrototypeOf(c) returns the root
    } else {
      c = { $ancestor: null };
      c.$create = function(fn,args){
        if (args == undefined) args = [];
        var o = Object.create(this);
        o.$init();
        try{
          if (typeof(fn)==="string"){
            o[fn].apply(o,args);
          } else {
            fn.apply(o,args);
          };
          o.AfterConstruction();
        } catch($e){
          // do not call BeforeDestruction
          if (o.Destroy) o.Destroy();
          o.$final();
          throw $e;
        }
        return o;
      };
      c.$destroy = function(fnname){
        this.BeforeDestruction();
        if (this[fnname]) this[fnname]();
        this.$final();
      };
    };
    rtl.initClass(c,parent,name,initfn,rttiname);
  },

  createClassExt: function(parent,name,ancestor,newinstancefnname,initfn,rttiname){
    // Create a class using an external ancestor.
    // If newinstancefnname is given, use that function to create the new object.
    // If exist call BeforeDestruction and AfterConstruction.
    var isFunc = rtl.isFunction(ancestor);
    var c = null;
    if (isFunc){
      // create pascal class descendent from JS function
      c = Object.create(ancestor.prototype);
      c.$ancestorfunc = ancestor;
      c.$ancestor = null; // no pascal ancestor
    } else if (ancestor.$func){
      // create pascal class descendent from a pascal class descendent of a JS function
      isFunc = true;
      c = Object.create(ancestor);
      c.$ancestor = ancestor;
    } else {
      c = Object.create(ancestor);
      c.$ancestor = null; // no pascal ancestor
    }
    c.$create = function(fn,args){
      if (args == undefined) args = [];
      var o = null;
      if (newinstancefnname.length>0){
        o = this[newinstancefnname](fn,args);
      } else if(isFunc) {
        o = new this.$func(args);
      } else {
        o = Object.create(c);
      }
      if (o.$init) o.$init();
      try{
        if (typeof(fn)==="string"){
          this[fn].apply(o,args);
        } else {
          fn.apply(o,args);
        };
        if (o.AfterConstruction) o.AfterConstruction();
      } catch($e){
        // do not call BeforeDestruction
        if (o.Destroy) o.Destroy();
        if (o.$final) o.$final();
        throw $e;
      }
      return o;
    };
    c.$destroy = function(fnname){
      if (this.BeforeDestruction) this.BeforeDestruction();
      if (this[fnname]) this[fnname]();
      if (this.$final) this.$final();
    };
    rtl.initClass(c,parent,name,initfn,rttiname);
    if (isFunc){
      function f(){}
      f.prototype = c;
      c.$func = f;
    }
  },

  createHelper: function(parent,name,ancestor,initfn,rttiname){
    // create a helper,
    // ancestor must be null or a helper,
    var c = null;
    if (ancestor != null){
      c = Object.create(ancestor);
      c.$ancestor = ancestor;
      // c.$ancestor === Object.getPrototypeOf(c)
    } else {
      c = { $ancestor: null };
    };
    parent[name] = c;
    c.$class = c; // Note: o.$class === Object.getPrototypeOf(o)
    c.$classname = rttiname?rttiname:name;
    parent = rtl.initStruct(c,parent,name);
    c.$fullname = parent.$name+'.'+name;
    // rtti
    var t = c.$module.$rtti.$Helper(c.$classname,{ "helper": c });
    c.$rtti = t;
    if (rtl.isObject(ancestor)) t.ancestor = ancestor.$rtti;
    if (!t.ancestor) t.ancestor = null;
    // init members
    initfn.call(c);
  },

  tObjectDestroy: "Destroy",

  free: function(obj,name){
    if (obj[name]==null) return null;
    obj[name].$destroy(rtl.tObjectDestroy);
    obj[name]=null;
  },

  freeLoc: function(obj){
    if (obj==null) return null;
    obj.$destroy(rtl.tObjectDestroy);
    return null;
  },

  hideProp: function(o,p,v){
    Object.defineProperty(o,p, {
      enumerable: false,
      configurable: true,
      writable: true
    });
    if(arguments.length>2){ o[p]=v; }
  },

  recNewT: function(parent,name,initfn,full){
    // create new record type
    var t = {};
    if (parent) parent[name] = t;
    var h = rtl.hideProp;
    if (full){
      rtl.initStruct(t,parent,name);
      t.$record = t;
      h(t,'$record');
      h(t,'$name');
      h(t,'$parent');
      h(t,'$module');
      h(t,'$initSpec');
    }
    initfn.call(t);
    if (!t.$new){
      t.$new = function(){ return Object.create(t); };
    }
    t.$clone = function(r){ return t.$new().$assign(r); };
    h(t,'$new');
    h(t,'$clone');
    h(t,'$eq');
    h(t,'$assign');
    return t;
  },

  is: function(instance,type){
    return type.isPrototypeOf(instance) || (instance===type);
  },

  isExt: function(instance,type,mode){
    // mode===1 means instance must be a Pascal class instance
    // mode===2 means instance must be a Pascal class
    // Notes:
    // isPrototypeOf and instanceof return false on equal
    // isPrototypeOf does not work for Date.isPrototypeOf(new Date())
    //   so if isPrototypeOf is false test with instanceof
    // instanceof needs a function on right side
    if (instance == null) return false; // Note: ==null checks for undefined too
    if ((typeof(type) !== 'object') && (typeof(type) !== 'function')) return false;
    if (instance === type){
      if (mode===1) return false;
      if (mode===2) return rtl.isPasClass(instance);
      return true;
    }
    if (type.isPrototypeOf && type.isPrototypeOf(instance)){
      if (mode===1) return rtl.isPasClassInstance(instance);
      if (mode===2) return rtl.isPasClass(instance);
      return true;
    }
    if ((typeof type == 'function') && (instance instanceof type)) return true;
    return false;
  },

  Exception: null,
  EInvalidCast: null,
  EAbstractError: null,
  ERangeError: null,
  EIntOverflow: null,
  EPropWriteOnly: null,

  raiseE: function(typename){
    var t = rtl[typename];
    if (t==null){
      var mod = pas.SysUtils;
      if (!mod) mod = pas.sysutils;
      if (!mod) mod = pas["System.SysUtils"];
      if (mod){
        t = mod[typename];
        if (!t) t = mod[typename.toLowerCase()];
        if (!t) t = mod['Exception'];
        if (!t) t = mod['exception'];
      }
      if (t) rtl[typename]=t;
    }
    if (t) {
      
      if (t.Create){
        var e = t.$create("Create");
      } else if (t.create) {
        var e = t.$create("create");
      }
      if (e) {
        e.FJSError = new Error;
        throw e ;
      }
    }
    if (typename === "EInvalidCast") throw new Error("invalid type cast");
    if (typename === "EAbstractError") throw new Error("Abstract method called");
    if (typename === "ERangeError") throw new Error("range error");
    throw typename;
  },

  as: function(instance,type){
    if((instance === null) || rtl.is(instance,type)) return instance;
    rtl.raiseE("EInvalidCast");
  },

  asExt: function(instance,type,mode){
    if((instance === null) || rtl.isExt(instance,type,mode)) return instance;
    rtl.raiseE("EInvalidCast");
  },

  createInterface: function(module, name, guid, fnnames, ancestor, initfn, rttiname){
    //console.log('createInterface name="'+name+'" guid="'+guid+'" names='+fnnames);
    var i = ancestor?Object.create(ancestor):{};
    module[name] = i;
    i.$module = module;
    i.$name = rttiname?rttiname:name;
    i.$fullname = module.$name+'.'+i.$name;
    i.$guid = guid;
    i.$guidr = null;
    i.$names = fnnames?fnnames:[];
    if (rtl.isFunction(initfn)){
      // rtti
      if (rtl.debug_rtti) rtl.debug('createInterface '+i.$fullname);
      var t = i.$module.$rtti.$Interface(i.$name,{ "interface": i, module: module });
      i.$rtti = t;
      if (ancestor) t.ancestor = ancestor.$rtti;
      if (!t.ancestor) t.ancestor = null;
      initfn.call(i);
    }
    return i;
  },

  strToGUIDR: function(s,g){
    var p = 0;
    function n(l){
      var h = s.substr(p,l);
      p+=l;
      return parseInt(h,16);
    }
    p+=1; // skip {
    g.D1 = n(8);
    p+=1; // skip -
    g.D2 = n(4);
    p+=1; // skip -
    g.D3 = n(4);
    p+=1; // skip -
    if (!g.D4) g.D4=[];
    g.D4[0] = n(2);
    g.D4[1] = n(2);
    p+=1; // skip -
    for(var i=2; i<8; i++) g.D4[i] = n(2);
    return g;
  },

  guidrToStr: function(g){
    if (g.$intf) return g.$intf.$guid;
    var h = rtl.hexStr;
    var s='{'+h(g.D1,8)+'-'+h(g.D2,4)+'-'+h(g.D3,4)+'-'+h(g.D4[0],2)+h(g.D4[1],2)+'-';
    for (var i=2; i<8; i++) s+=h(g.D4[i],2);
    s+='}';
    return s;
  },

  createTGUID: function(guid){
    var TGuid = (pas.System)?pas.System.TGuid:pas.system.tguid;
    var g = rtl.strToGUIDR(guid,TGuid.$new());
    return g;
  },

  getIntfGUIDR: function(intfTypeOrVar){
    if (!intfTypeOrVar) return null;
    if (!intfTypeOrVar.$guidr){
      var g = rtl.createTGUID(intfTypeOrVar.$guid);
      if (!intfTypeOrVar.hasOwnProperty('$guid')) intfTypeOrVar = Object.getPrototypeOf(intfTypeOrVar);
      g.$intf = intfTypeOrVar;
      intfTypeOrVar.$guidr = g;
    }
    return intfTypeOrVar.$guidr;
  },

  addIntf: function (aclass, intf, map){
    function jmp(fn){
      if (typeof(fn)==="function"){
        return function(){ return fn.apply(this.$o,arguments); };
      } else {
        return function(){ rtl.raiseE('EAbstractError'); };
      }
    }
    if(!map) map = {};
    var t = intf;
    var item = Object.create(t);
    if (!aclass.hasOwnProperty('$intfmaps')) aclass.$intfmaps = {};
    aclass.$intfmaps[intf.$guid] = item;
    do{
      var names = t.$names;
      if (!names) break;
      for (var i=0; i<names.length; i++){
        var intfname = names[i];
        var fnname = map[intfname];
        if (!fnname) fnname = intfname;
        //console.log('addIntf: intftype='+t.$name+' index='+i+' intfname="'+intfname+'" fnname="'+fnname+'" old='+typeof(item[intfname]));
        item[intfname] = jmp(aclass[fnname]);
      }
      t = Object.getPrototypeOf(t);
    }while(t!=null);
  },

  getIntfG: function (obj, guid, query){
    if (!obj) return null;
    //console.log('getIntfG: obj='+obj.$classname+' guid='+guid+' query='+query);
    // search
    var maps = obj.$intfmaps;
    if (!maps) return null;
    var item = maps[guid];
    if (!item) return null;
    // check delegation
    //console.log('getIntfG: obj='+obj.$classname+' guid='+guid+' query='+query+' item='+typeof(item));
    if (typeof item === 'function') return item.call(obj); // delegate. Note: COM contains _AddRef
    // check cache
    var intf = null;
    if (obj.$interfaces){
      intf = obj.$interfaces[guid];
      //console.log('getIntfG: obj='+obj.$classname+' guid='+guid+' cache='+typeof(intf));
    }
    if (!intf){ // intf can be undefined!
      intf = Object.create(item);
      intf.$o = obj;
      if (!obj.$interfaces) obj.$interfaces = {};
      obj.$interfaces[guid] = intf;
    }
    if (typeof(query)==='object'){
      // called by queryIntfT
      var o = null;
      if (intf.QueryInterface(rtl.getIntfGUIDR(query),
          {get:function(){ return o; }, set:function(v){ o=v; }}) === 0){
        return o;
      } else {
        return null;
      }
    } else if(query===2){
      // called by TObject.GetInterfaceByStr
      if (intf.$kind === 'com') intf._AddRef();
    }
    return intf;
  },

  getIntfT: function(obj,intftype){
    return rtl.getIntfG(obj,intftype.$guid);
  },

  queryIntfT: function(obj,intftype){
    return rtl.getIntfG(obj,intftype.$guid,intftype);
  },

  queryIntfIsT: function(obj,intftype){
    var i = rtl.getIntfG(obj,intftype.$guid);
    if (!i) return false;
    if (i.$kind === 'com') i._Release();
    return true;
  },

  asIntfT: function (obj,intftype){
    var i = rtl.getIntfG(obj,intftype.$guid);
    if (i!==null) return i;
    rtl.raiseEInvalidCast();
  },

  intfIsIntfT: function(intf,intftype){
    return (intf!==null) && rtl.queryIntfIsT(intf.$o,intftype);
  },

  intfAsIntfT: function (intf,intftype){
    if (!intf) return null;
    var i = rtl.getIntfG(intf.$o,intftype.$guid);
    if (i) return i;
    rtl.raiseEInvalidCast();
  },

  intfIsClass: function(intf,classtype){
    return (intf!=null) && (rtl.is(intf.$o,classtype));
  },

  intfAsClass: function(intf,classtype){
    if (intf==null) return null;
    return rtl.as(intf.$o,classtype);
  },

  intfToClass: function(intf,classtype){
    if ((intf!==null) && rtl.is(intf.$o,classtype)) return intf.$o;
    return null;
  },

  // interface reference counting
  intfRefs: { // base object for temporary interface variables
    ref: function(id,intf){
      // called for temporary interface references needing delayed release
      var old = this[id];
      //console.log('rtl.intfRefs.ref: id='+id+' old="'+(old?old.$name:'null')+'" intf="'+(intf?intf.$name:'null')+' $o='+(intf?intf.$o:'null'));
      if (old){
        // called again, e.g. in a loop
        delete this[id];
        old._Release(); // may fail
      }
      if(intf) {
        this[id]=intf;
      }
      return intf;
    },
    free: function(){
      //console.log('rtl.intfRefs.free...');
      for (var id in this){
        if (this.hasOwnProperty(id)){
          var intf = this[id];
          if (intf){
            //console.log('rtl.intfRefs.free: id='+id+' '+intf.$name+' $o='+intf.$o.$classname);
            intf._Release();
          }
        }
      }
    }
  },

  createIntfRefs: function(){
    //console.log('rtl.createIntfRefs');
    return Object.create(rtl.intfRefs);
  },

  setIntfP: function(path,name,value,skipAddRef){
    var old = path[name];
    //console.log('rtl.setIntfP path='+path+' name='+name+' old="'+(old?old.$name:'null')+'" value="'+(value?value.$name:'null')+'"');
    if (old === value) return;
    if (old !== null){
      path[name]=null;
      old._Release();
    }
    if (value !== null){
      if (!skipAddRef) value._AddRef();
      path[name]=value;
    }
  },

  setIntfL: function(old,value,skipAddRef){
    //console.log('rtl.setIntfL old="'+(old?old.$name:'null')+'" value="'+(value?value.$name:'null')+'"');
    if (old !== value){
      if (value!==null){
        if (!skipAddRef) value._AddRef();
      }
      if (old!==null){
        old._Release();  // Release after AddRef, to avoid double Release if Release creates an exception
      }
    } else if (skipAddRef){
      if (old!==null){
        old._Release();  // value has an AddRef
      }
    }
    return value;
  },

  _AddRef: function(intf){
    //if (intf) console.log('rtl._AddRef intf="'+(intf?intf.$name:'null')+'"');
    if (intf) intf._AddRef();
    return intf;
  },

  _Release: function(intf){
    //if (intf) console.log('rtl._Release intf="'+(intf?intf.$name:'null')+'"');
    if (intf) intf._Release();
    return intf;
  },

  trunc: function(a){
    return a<0 ? Math.ceil(a) : Math.floor(a);
  },

  checkMethodCall: function(obj,type){
    if (rtl.isObject(obj) && rtl.is(obj,type)) return;
    rtl.raiseE("EInvalidCast");
  },

  oc: function(i){
    // overflow check integer
    if ((Math.floor(i)===i) && (i>=-0x1fffffffffffff) && (i<=0x1fffffffffffff)) return i;
    rtl.raiseE('EIntOverflow');
  },

  rc: function(i,minval,maxval){
    // range check integer
    if ((Math.floor(i)===i) && (i>=minval) && (i<=maxval)) return i;
    rtl.raiseE('ERangeError');
  },

  rcc: function(c,minval,maxval){
    // range check char
    if ((typeof(c)==='string') && (c.length===1)){
      var i = c.charCodeAt(0);
      if ((i>=minval) && (i<=maxval)) return c;
    }
    rtl.raiseE('ERangeError');
  },

  rcSetCharAt: function(s,index,c){
    // range check setCharAt
    if ((typeof(s)!=='string') || (index<0) || (index>=s.length)) rtl.raiseE('ERangeError');
    return rtl.setCharAt(s,index,c);
  },

  rcCharAt: function(s,index){
    // range check charAt
    if ((typeof(s)!=='string') || (index<0) || (index>=s.length)) rtl.raiseE('ERangeError');
    return s.charAt(index);
  },

  rcArrR: function(arr,index){
    // range check read array
    if (Array.isArray(arr) && (typeof(index)==='number') && (index>=0) && (index<arr.length)){
      if (arguments.length>2){
        // arr,index1,index2,...
        arr=arr[index];
        for (var i=2; i<arguments.length; i++) arr=rtl.rcArrR(arr,arguments[i]);
        return arr;
      }
      return arr[index];
    }
    rtl.raiseE('ERangeError');
  },

  rcArrW: function(arr,index,value){
    // range check write array
    // arr,index1,index2,...,value
    for (var i=3; i<arguments.length; i++){
      arr=rtl.rcArrR(arr,index);
      index=arguments[i-1];
      value=arguments[i];
    }
    if (Array.isArray(arr) && (typeof(index)==='number') && (index>=0) && (index<arr.length)){
      return arr[index]=value;
    }
    rtl.raiseE('ERangeError');
  },

  length: function(arr){
    return (arr == null) ? 0 : arr.length;
  },

  arrayRef: function(a){
    if (a!=null) rtl.hideProp(a,'$pas2jsrefcnt',2);
    return a;
  },

  arrayManaged: function(refCnt,mode,a){
    // mode: 0: don't touch elements, 1: null elements, 2: _AddRef elements
    if(!a) a = [];
    a.$pas2jsrefcnt = refCnt?refCnt:0;
    a._AddRef = function(){
      this.$pas2jsrefcnt++;
    };
    a._Release = function(){
      this.$pas2jsrefcnt--;
      if (this.$pas2jsrefcnt==0){
        for (var i=0; i<this.length; i++){
          rtl.setIntfP(this,i,null);
        }
      }
    };
    if (mode>0){
      for (var i=0; i<a.length; i++){
        if (mode === 2){
          rtl._AddRef(a[i]);
        } else {
          a[i]=null;
        }
      }
    }
    return a;
  },

  arraySetLength: function(arr,defaultvalue,newlength){
    var stack = [];
    var s = 9999;
    for (var i=2; i<arguments.length; i++){
      var j = arguments[i];
      if (j==='s'){ s = i-2; }
      else {
        stack.push({ dim:j+0, a:null, i:0, src:null });
      }
    }
    var dimmax = stack.length-1;
    var depth = 0;
    var newlen = 0;
    var item = null;
    var a = null;
    var src = arr;
    var srclen = 0, oldlen = 0;
    var type = 0;
    var managed = false;
    if (rtl.isArray(defaultvalue)){
      // array of dyn array
      type = 1;
    } else if (rtl.isObject(defaultvalue)) {
      if (rtl.isTRecord(defaultvalue)){
        // array of record
        type = 2;
      } else {
        // array of set
        type = 3;
      }
    } else if (defaultvalue == 'R'){
      // array of COM interface
      type = 4;
      managed = true;
    }

    do{
      if (depth>0){
        item = stack[depth-1];
        src = (item.src && item.src.length>item.i) ? item.src[item.i] : null;
      }
      if (!src){
        // init array
        managed ? a=rtl.arrayManaged(1) : a=[];
        srclen = 0;
        oldlen = 0;
      } else if (src.$pas2jsrefcnt>1 || depth>=s){
        // clone
        if (managed){
          a = rtl.arrayManaged(1);
          src.$pas2jsrefcnt--;
        } else {
          a = [];
        }
        srclen = src.length;
        oldlen = srclen;
      } else {
        // keep old
        a = src;
        srclen = 0;
        oldlen = a.length;
      }
      newlen = stack[depth].dim;
      if (managed){
        if (a.length>=newlen){
          // shrink -> release elements
          for (var i=a.length-1; i>=newlen; i--){
            rtl.setIntfP(a,i,null);
          }
          a.length = newlen;
        } else {
          // enlarge -> null elements
          var l = a.length;
          a.length = newlen;
          for (var i=l; i<newlen; i++){
            a[i]=null;
          }
          oldlen = newlen;
        }
      } else {
        a.length = newlen;
      }
      if (depth>0){
        item.a[item.i]=a;
        item.i++;
        if ((newlen===0) && (item.i<item.a.length)) continue;
      }
      if (newlen>0){
        if (depth<dimmax){
          item = stack[depth];
          item.a = a;
          item.i = 0;
          item.src = src;
          depth++;
          continue;
        } else {
          if (srclen>newlen) srclen=newlen;
          if (type == 0){
            // array of simple value
            for (var i=0; i<srclen; i++) a[i]=src[i];
            for (var i=oldlen; i<newlen; i++) a[i]=defaultvalue;
          } else if (type == 1){
            // array of dyn array
            for (var i=0; i<srclen; i++) a[i]=src[i];
            for (var i=oldlen; i<newlen; i++) a[i]=[];
          } else if (type == 2) {
            // array of record
            for (var i=0; i<srclen; i++) a[i]=defaultvalue.$clone(src[i]);
            for (var i=oldlen; i<newlen; i++) a[i]=defaultvalue.$new();
          } else if (type == 3) {
            // array of set
            for (var i=0; i<srclen; i++) a[i]=rtl.refSet(src[i]);
            for (var i=oldlen; i<newlen; i++) a[i]={};
          } else if (type == 4){
            // array of interface
            for (var i=0; i<srclen; i++) rtl.setIntfP(a,i,src[i]);
            for (var i=oldlen; i<newlen; i++) a[i]=null;
          }
        }
      }
      // backtrack
      while ((depth>0) && (stack[depth-1].i>=stack[depth-1].dim)){
        depth--;
      };
      if (depth===0){
        return dimmax===0 ? a : stack[0].a;
      }
    }while (true);
  },

  arrayEq: function(a,b){
    if (a===null) return b===null;
    if (b===null) return false;
    if (a.length!==b.length) return false;
    for (var i=0; i<a.length; i++) if (a[i]!==b[i]) return false;
    return true;
  },

  arrayClone: function(type,src,srcpos,endpos,dst,dstpos){
    // type: 0 for references or simple values
    // src must not be null
    // dst at dstpos must not contain managed old values
    // This function does not range check.
    if(type === 'refSet') {
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = rtl.refSet(src[srcpos]); // ref set
    } else if (type === 'slice'){
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = src[srcpos].slice(0); // clone static array of simple types
    } else if (typeof(type)==='function'){
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = type(src[srcpos]); // clone function
    } else if (rtl.isTRecord(type)){
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = type.$clone(src[srcpos]); // clone record
    } else if (type === 'R'){
      // clone managed instance
      for (; srcpos<endpos; srcpos++){
        dst[dstpos++]=rtl._AddRef(src[srcpos]);
      }
    } else {
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = src[srcpos]; // reference
    };
  },

  arrayConcat: function(type){
    // type: see rtl.arrayClone
    // returns refCnt=1
    var a = [];
    var l = 0;
    for (var i=1; i<arguments.length; i++){
      var src = arguments[i];
      if (src !== null) l+=src.length;
    };
    a.length = l;
    if (type === 'R'){
      rtl.arrayManaged(1,1,a);
    }
    l=0;
    for (var i=1; i<arguments.length; i++){
      var src = arguments[i];
      if (src === null) continue;
      rtl.arrayClone(type,src,0,src.length,a,l);
      l+=src.length;
    };
    return a;
  },

  arrayConcatN: function(){
    var a = null;
    for (var i=0; i<arguments.length; i++){
      var src = arguments[i];
      if (src === null) continue;
      if (a===null){
        a=rtl.arrayRef(src); // Note: concat(arr) does not clone
      } else if (a.$pas2jsrefcnt>1){
        a=a.concat(src); // clone a and append src
      } else {
        for (var i=0; i<src.length; i++){
          a.push(src[i]);
        }
      }
    };
    return a;
  },

  arrayPush: function(type,a){
    if(a===null){
      a=(type==='R') ? rtl.arrayManaged(1) : [];
    } else if (a.$pas2jsrefcnt>1){
      a=rtl.arrayCopy(type,a,0,a.length);
    }
    rtl.arrayClone(type,arguments,2,arguments.length,a,a.length);
    return a;
  },

  arrayPushN: function(a){
    if(a===null){
      a=[];
    } else if (a.$pas2jsrefcnt>1){
      a=a.concat();
    }
    for (var i=1; i<arguments.length; i++){
      a.push(arguments[i]);
    }
    return a;
  },

  arrayCopy: function(type, srcarray, index, count){
    // type: see rtl.arrayClone
    // if count is missing, use srcarray.length
    if (srcarray === null) return (type === 'R') ? null : [];
    if (count === undefined) count=srcarray.length;
    if (index < 0){
      count+=index;
      index = 0;
    }
    var end = index+count;
    if (end>srcarray.length) end = srcarray.length;
    if (index>=end) return (type === 'R') ? null : [];
    if (type===0){
      return srcarray.slice(index,end);
    } else {
      var a = [];
      a.length = end-index;
      if (type === 'R'){
        rtl.arrayManaged(1,1,a);
      }
      rtl.arrayClone(type,srcarray,index,end,a,0);
      return a;
    }
  },

  arrayInsert: function(item, a, index, type){
    var m = (type === 'R');
    if (m) rtl._AddRef(item);
    if (a){
      if (a.$pas2jsrefcnt>1){
        if (m){
          // clone
          a.$pas2jsrefcnt--;
          a=rtl.arrayManaged(1,2,a.concat());
        } else {
          a=a.concat();
        }
      }
      a.splice(index,0,item);
      return a;
    } else {
      a = [item];
      if (m) a=rtl.arrayManaged(1,0,a);
      return a;
    }
  },

  arrayDeleteR: function(a, index, count){
    if (a===null || index<0 || index>=a.length || count<=0) return a;
    if (index+count>a.length) count=a.length-index;
    if (a.$pas2jsrefcnt>1){
      // clone
      a.$pas2jsrefcnt--;
      a=rtl.arrayManaged(1,2,a.concat());
    }
    for (var i=0; i<count; i++) rtl.setIntfP(a,index+i,null);
    a.splice(index,count);
    return a;
  },

  setCharAt: function(s,index,c){
    return s.substr(0,index)+c+s.substr(index+1);
  },

  getResStr: function(mod,name){
    var rs = mod.$resourcestrings[name];
    return rs.current?rs.current:rs.org;
  },

  createSet: function(){
    var s = {};
    for (var i=0; i<arguments.length; i++){
      if (arguments[i]!=null){
        s[arguments[i]]=true;
      } else {
        var first=arguments[i+=1];
        var last=arguments[i+=1];
        for(var j=first; j<=last; j++) s[j]=true;
      }
    }
    return s;
  },

  cloneSet: function(s){
    var r = {};
    for (var key in s) r[key]=true;
    return r;
  },

  refSet: function(s){
    rtl.hideProp(s,'$shared',true);
    return s;
  },

  includeSet: function(s,enumvalue){
    if (s.$shared) s = rtl.cloneSet(s);
    s[enumvalue] = true;
    return s;
  },

  excludeSet: function(s,enumvalue){
    if (s.$shared) s = rtl.cloneSet(s);
    delete s[enumvalue];
    return s;
  },

  diffSet: function(s,t){
    var r = {};
    for (var key in s) if (!t[key]) r[key]=true;
    return r;
  },

  unionSet: function(s,t){
    var r = {};
    for (var key in s) r[key]=true;
    for (var key in t) r[key]=true;
    return r;
  },

  intersectSet: function(s,t){
    var r = {};
    for (var key in s) if (t[key]) r[key]=true;
    return r;
  },

  symDiffSet: function(s,t){
    var r = {};
    for (var key in s) if (!t[key]) r[key]=true;
    for (var key in t) if (!s[key]) r[key]=true;
    return r;
  },

  eqSet: function(s,t){
    for (var key in s) if (!t[key]) return false;
    for (var key in t) if (!s[key]) return false;
    return true;
  },

  neSet: function(s,t){
    return !rtl.eqSet(s,t);
  },

  leSet: function(s,t){
    for (var key in s) if (!t[key]) return false;
    return true;
  },

  geSet: function(s,t){
    for (var key in t) if (!s[key]) return false;
    return true;
  },

  strSetLength: function(s,newlen){
    var oldlen = s.length;
    if (oldlen > newlen){
      return s.substring(0,newlen);
    } else if (s.repeat){
      // Note: repeat needs ECMAScript6!
      return s+' '.repeat(newlen-oldlen);
    } else {
       while (oldlen<newlen){
         s+=' ';
         oldlen++;
       };
       return s;
    }
  },

  spaceLeft: function(s,width){
    var l=s.length;
    if (l>=width) return s;
    if (s.repeat){
      // Note: repeat needs ECMAScript6!
      return ' '.repeat(width-l) + s;
    } else {
      while (l<width){
        s=' '+s;
        l++;
      };
      return s;
    };
  },

  floatToStr: function(d,w,p){
    // input 1-3 arguments: double, width, precision
    if (arguments.length>2){
      return rtl.spaceLeft(d.toFixed(p),w);
    } else {
	  // exponent width
	  var pad = "";
	  var ad = Math.abs(d);
	  if (((ad>1) && (ad<1.0e+10)) ||  ((ad>1.e-10) && (ad<1))) {
		pad='00';
	  } else if ((ad>1) && (ad<1.0e+100) || (ad<1.e-10)) {
		pad='0';
      }  	
	  if (arguments.length<2) {
	    w=24;		
      } else if (w<9) {
		w=9;
      }		  
      var p = w-8;
      var s=(d>0 ? " " : "" ) + d.toExponential(p);
      s=s.replace(/e(.)/,'E$1'+pad);
      return rtl.spaceLeft(s,w);
    }
  },

  valEnum: function(s, enumType, setCodeFn){
    s = s.toLowerCase();
    for (var key in enumType){
      if((typeof(key)==='string') && (key.toLowerCase()===s)){
        setCodeFn(0);
        return enumType[key];
      }
    }
    setCodeFn(1);
    return 0;
  },

  lw: function(l){
    // fix longword bitwise operation
    return l<0?l+0x100000000:l;
  },

  and: function(a,b){
    var hi = 0x80000000;
    var low = 0x7fffffff;
    var h = (a / hi) & (b / hi);
    var l = (a & low) & (b & low);
    return h*hi + l;
  },

  or: function(a,b){
    var hi = 0x80000000;
    var low = 0x7fffffff;
    var h = (a / hi) | (b / hi);
    var l = (a & low) | (b & low);
    return h*hi + l;
  },

  xor: function(a,b){
    var hi = 0x80000000;
    var low = 0x7fffffff;
    var h = (a / hi) ^ (b / hi);
    var l = (a & low) ^ (b & low);
    return h*hi + l;
  },

  shr: function(a,b){
    if (a<0) a += rtl.hiInt;
    if (a<0x80000000) return a >> b;
    if (b<=0) return a;
    if (b>54) return 0;
    return Math.floor(a / Math.pow(2,b));
  },

  shl: function(a,b){
    if (a<0) a += rtl.hiInt;
    if (b<=0) return a;
    if (b>54) return 0;
    var r = a * Math.pow(2,b);
    if (r <= rtl.hiInt) return r;
    return r % rtl.hiInt;
  },

  initRTTI: function(){
    if (rtl.debug_rtti) rtl.debug('initRTTI');

    // base types
    rtl.tTypeInfo = { name: "tTypeInfo", kind: 0, $module: null, attr: null };
    function newBaseTI(name,kind,ancestor){
      if (!ancestor) ancestor = rtl.tTypeInfo;
      if (rtl.debug_rtti) rtl.debug('initRTTI.newBaseTI "'+name+'" '+kind+' ("'+ancestor.name+'")');
      var t = Object.create(ancestor);
      t.name = name;
      t.kind = kind;
      rtl[name] = t;
      return t;
    };
    function newBaseInt(name,minvalue,maxvalue,ordtype){
      var t = newBaseTI(name,1 /* tkInteger */,rtl.tTypeInfoInteger);
      t.minvalue = minvalue;
      t.maxvalue = maxvalue;
      t.ordtype = ordtype;
      return t;
    };
    newBaseTI("tTypeInfoInteger",1 /* tkInteger */);
    newBaseInt("shortint",-0x80,0x7f,0);
    newBaseInt("byte",0,0xff,1);
    newBaseInt("smallint",-0x8000,0x7fff,2);
    newBaseInt("word",0,0xffff,3);
    newBaseInt("longint",-0x80000000,0x7fffffff,4);
    newBaseInt("longword",0,0xffffffff,5);
    newBaseInt("nativeint",-0x10000000000000,0xfffffffffffff,6);
    newBaseInt("nativeuint",0,0xfffffffffffff,7);
    newBaseInt("char",0,65535,3 /* word */).kind=2 /* tkChar */;
    newBaseTI("string",3 /* tkString */);
    newBaseTI("tTypeInfoEnum",4 /* tkEnumeration */,rtl.tTypeInfoInteger);
    newBaseTI("tTypeInfoSet",5 /* tkSet */);
    newBaseTI("double",6 /* tkDouble */);
    newBaseTI("boolean",7 /* tkBool */);
    newBaseTI("tTypeInfoProcVar",8 /* tkProcVar */);
    newBaseTI("tTypeInfoMethodVar",9 /* tkMethod */,rtl.tTypeInfoProcVar);
    newBaseTI("tTypeInfoArray",10 /* tkArray */);
    newBaseTI("tTypeInfoDynArray",11 /* tkDynArray */);
    newBaseTI("tTypeInfoPointer",15 /* tkPointer */);
    var t = newBaseTI("pointer",15 /* tkPointer */,rtl.tTypeInfoPointer);
    t.reftype = null;
    newBaseTI("jsvalue",16 /* tkJSValue */);
    newBaseTI("tTypeInfoRefToProcVar",17 /* tkRefToProcVar */,rtl.tTypeInfoProcVar);

    // member kinds
    rtl.tTypeMember = { attr: null };
    function newMember(name,kind){
      var m = Object.create(rtl.tTypeMember);
      m.name = name;
      m.kind = kind;
      rtl[name] = m;
    };
    newMember("tTypeMemberField",1); // tmkField
    newMember("tTypeMemberMethod",2); // tmkMethod
    newMember("tTypeMemberProperty",3); // tmkProperty

    // base object for storing members: a simple object
    rtl.tTypeMembers = {};

    // tTypeInfoStruct - base object for tTypeInfoClass, tTypeInfoRecord, tTypeInfoInterface
    var tis = newBaseTI("tTypeInfoStruct",0);
    tis.$addMember = function(name,ancestor,vis,options){
      if (rtl.debug_rtti){
        if (!rtl.hasString(name) || (name.charAt()==='$')) throw 'invalid member "'+name+'", this="'+this.name+'"';
        if (!rtl.is(ancestor,rtl.tTypeMember)) throw 'invalid ancestor "'+ancestor+':'+ancestor.name+'", "'+this.name+'.'+name+'"';
        if ((options!=undefined) && (typeof(options)!='object')) throw 'invalid options "'+options+'", "'+this.name+'.'+name+'"';
      };
      var t = Object.create(ancestor);
      t.name = name;
      this.members[name] = t;
      this.names.push(name);
      t.visibility = vis;
      if (rtl.isObject(options)){
        for (var key in options) if (options.hasOwnProperty(key)) t[key] = options[key];
      };
      return t;
    };
    tis.addField = function(name,type,vis,options){
      var t = this.$addMember(name,rtl.tTypeMemberField,vis?vis:2,options);
      if (rtl.debug_rtti){
        if (!rtl.is(type,rtl.tTypeInfo)) throw 'invalid type "'+type+'", "'+this.name+'.'+name+'"';
      };
      t.typeinfo = type;
      this.fields.push(name);
      return t;
    };
    tis.addFields = function(){
      var i=0;
      while(i<arguments.length){
        var name = arguments[i++];
        var type = arguments[i++];
        if ((i<arguments.length) && (typeof(arguments[i])==='object')){
          this.addField(name,type,arguments[i++]);
        } else {
          this.addField(name,type);
        };
      };
    };
    tis.addMethod = function(name,methodkind,params,vis,result,flags,options){
      // optional: vis, result, flags, options
      var t = this.$addMember(name,rtl.tTypeMemberMethod,vis?vis:2,options);
      t.methodkind = methodkind;
      t.procsig = rtl.newTIProcSig(params,result,flags);
      this.methods.push(name);
      return t;
    };
    tis.addProperty = function(name,flags,result,getter,setter,vis,options){
      var t = this.$addMember(name,rtl.tTypeMemberProperty,vis?vis:4,options);
      t.flags = flags;
      t.typeinfo = result;
      t.getter = getter;
      t.setter = setter;
      // Note: in options: params, stored, defaultvalue
      t.params = rtl.isArray(t.params) ? rtl.newTIParams(t.params) : null;
      this.properties.push(name);
      if (!rtl.isString(t.stored)) t.stored = "";
      return t;
    };
    tis.getField = function(index){
      return this.members[this.fields[index]];
    };
    tis.getMethod = function(index){
      return this.members[this.methods[index]];
    };
    tis.getProperty = function(index){
      return this.members[this.properties[index]];
    };

    newBaseTI("tTypeInfoRecord",12 /* tkRecord */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoClass",13 /* tkClass */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoClassRef",14 /* tkClassRef */);
    newBaseTI("tTypeInfoInterface",18 /* tkInterface */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoHelper",19 /* tkHelper */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoExtClass",20 /* tkExtClass */,rtl.tTypeInfoClass);
  },

  tSectionRTTI: {
    $module: null,
    $inherited: function(name,ancestor,o){
      if (rtl.debug_rtti){
        rtl.debug('tSectionRTTI.newTI "'+(this.$module?this.$module.$name:"(no module)")
          +'"."'+name+'" ('+ancestor.name+') '+(o?'init':'forward'));
      };
      var t = this[name];
      if (t){
        if (!t.$forward) throw 'duplicate type "'+name+'"';
        if (!ancestor.isPrototypeOf(t)) throw 'typeinfo ancestor mismatch "'+name+'" ancestor="'+ancestor.name+'" t.name="'+t.name+'"';
      } else {
        t = Object.create(ancestor);
        t.name = name;
        t.$module = this.$module;
        this[name] = t;
      }
      if (o){
        delete t.$forward;
        for (var key in o) if (o.hasOwnProperty(key)) t[key]=o[key];
      } else {
        t.$forward = true;
      }
      return t;
    },
    $Scope: function(name,ancestor,o){
      var t=this.$inherited(name,ancestor,o);
      t.members = {};
      t.names = [];
      t.fields = [];
      t.methods = [];
      t.properties = [];
      return t;
    },
    $TI: function(name,kind,o){ var t=this.$inherited(name,rtl.tTypeInfo,o); t.kind = kind; return t; },
    $Int: function(name,o){ return this.$inherited(name,rtl.tTypeInfoInteger,o); },
    $Enum: function(name,o){ return this.$inherited(name,rtl.tTypeInfoEnum,o); },
    $Set: function(name,o){ return this.$inherited(name,rtl.tTypeInfoSet,o); },
    $StaticArray: function(name,o){ return this.$inherited(name,rtl.tTypeInfoArray,o); },
    $DynArray: function(name,o){ return this.$inherited(name,rtl.tTypeInfoDynArray,o); },
    $ProcVar: function(name,o){ return this.$inherited(name,rtl.tTypeInfoProcVar,o); },
    $RefToProcVar: function(name,o){ return this.$inherited(name,rtl.tTypeInfoRefToProcVar,o); },
    $MethodVar: function(name,o){ return this.$inherited(name,rtl.tTypeInfoMethodVar,o); },
    $Record: function(name,o,typ){ if(typ) o.$record = typ; return this.$Scope(name,rtl.tTypeInfoRecord,o); },
    $Class: function(name,o){ return this.$Scope(name,rtl.tTypeInfoClass,o); },
    $ClassRef: function(name,o){ return this.$inherited(name,rtl.tTypeInfoClassRef,o); },
    $Pointer: function(name,o){ return this.$inherited(name,rtl.tTypeInfoPointer,o); },
    $Interface: function(name,o){ return this.$Scope(name,rtl.tTypeInfoInterface,o); },
    $Helper: function(name,o){ return this.$Scope(name,rtl.tTypeInfoHelper,o); },
    $ExtClass: function(name,o){ return this.$Scope(name,rtl.tTypeInfoExtClass,o); }
  },

  newTIParam: function(param){
    // param is an array, 0=name, 1=type, 2=optional flags
    var t = {
      name: param[0],
      typeinfo: param[1],
      flags: (rtl.isNumber(param[2]) ? param[2] : 0)
    };
    return t;
  },

  newTIParams: function(list){
    // list: optional array of [paramname,typeinfo,optional flags]
    var params = [];
    if (rtl.isArray(list)){
      for (var i=0; i<list.length; i++) params.push(rtl.newTIParam(list[i]));
    };
    return params;
  },

  newTIProcSig: function(params,result,flags){
    var s = {
      params: rtl.newTIParams(params),
      resulttype: result?result:null,
      flags: flags?flags:0
    };
    return s;
  },

  addResource: function(aRes){
    rtl.$res[aRes.name]=aRes;
  },

  getResource: function(aName){
    var res = rtl.$res[aName];
    if (res !== undefined) {
      return res;
    } else {
      return null;
    }
  },

  getResourceList: function(){
    return Object.keys(rtl.$res);
  }
}

rtl.module("System",[],function () {
  "use strict";
  var $mod = this;
  rtl.createClass(this,"TObject",null,function () {
    this.$init = function () {
    };
    this.$final = function () {
    };
    this.AfterConstruction = function () {
    };
    this.BeforeDestruction = function () {
    };
  });
  this.Random = function (Range) {
    return Math.floor(Math.random()*Range);
  };
  $mod.$init = function () {
    rtl.exitcode = 0;
  };
});
rtl.module("JS",["System"],function () {
  "use strict";
  var $mod = this;
});
rtl.module("weborworker",["System","JS"],function () {
  "use strict";
  var $mod = this;
});
rtl.module("Web",["System","JS","weborworker"],function () {
  "use strict";
  var $mod = this;
});
rtl.module("SysUtils",["System","JS"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  rtl.createClass(this,"Exception",pas.System.TObject,function () {
  });
  rtl.createClass(this,"EExternal",this.Exception,function () {
  });
  rtl.createClass(this,"EInvalidCast",this.Exception,function () {
  });
  rtl.createClass(this,"EIntError",this.EExternal,function () {
  });
  rtl.createClass(this,"ERangeError",this.EIntError,function () {
  });
  rtl.createClass(this,"EAbstractError",this.Exception,function () {
  });
  this.IntToStr = function (Value) {
    var Result = "";
    Result = "" + Value;
    return Result;
  };
  this.ShortMonthNames = rtl.arraySetLength(null,"",12);
  this.LongMonthNames = rtl.arraySetLength(null,"",12);
  this.ShortDayNames = rtl.arraySetLength(null,"",7);
  this.LongDayNames = rtl.arraySetLength(null,"",7);
  $mod.$implcode = function () {
    $impl.DefaultShortMonthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    $impl.DefaultLongMonthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    $impl.DefaultShortDayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    $impl.DefaultLongDayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    $impl.DoClassRef = function (C) {
      if (C === null) ;
    };
  };
  $mod.$init = function () {
    $impl.DoClassRef($mod.EInvalidCast);
    $impl.DoClassRef($mod.EAbstractError);
    $impl.DoClassRef($mod.ERangeError);
    $mod.ShortMonthNames = $impl.DefaultShortMonthNames.slice(0);
    $mod.LongMonthNames = $impl.DefaultLongMonthNames.slice(0);
    $mod.ShortDayNames = $impl.DefaultShortDayNames.slice(0);
    $mod.LongDayNames = $impl.DefaultLongDayNames.slice(0);
  };
},[]);
rtl.module("webaudio",["System","SysUtils","JS","weborworker","Web"],function () {
  "use strict";
  var $mod = this;
});
rtl.module("Math",["System"],function () {
  "use strict";
  var $mod = this;
});
rtl.module("program",["System","Web","webaudio","SysUtils","Math"],function () {
  "use strict";
  var $mod = this;
  this.ANCHO = 800;
  this.ALTO = 500;
  this.BANCAL_Y = 430;
  this.BANCAL_X = 30;
  this.BANCAL_W = 740;
  this.MARGEN_LATERAL = 10;
  this.MARGEN_BICHO = 20;
  this.MAX_LASERS = 50;
  this.MAX_BICHOS = 100;
  this.CANGREJO_VEL = 360.0;
  this.LASER_VEL = 540.0;
  this.BICHO_VY_MIN = 36.0;
  this.BICHO_VY_VAR = 48.0;
  this.BICHO_VX_MIN = 30.0;
  this.BICHO_VX_VAR = 90.0;
  this.ZIGZAG_VEL = 6.0;
  this.ZIGZAG_AMPL = 120.0;
  this.SPAWN_INICIAL = 1.5;
  this.SPAWN_MINIMO = 0.5;
  this.SPAWN_PASO = 0.08;
  this.LASER_W = 4.0;
  this.LASER_H = 20.0;
  this.BICHO_LADO = 24.0;
  this.VIDAS_INICIALES = 3;
  this.DT_MAXIMO = 0.05;
  this.C_FONDO = "#091524";
  this.C_TIERRA = "#5a3d28";
  this.C_TIERRA_OSC = "#3d2516";
  this.C_TRONCO = "#5c4033";
  this.C_COPA = "#145214";
  this.C_CANGREJO = "#e63232";
  this.C_PINZA = "#b41e1e";
  this.C_OJO = "#00ccff";
  this.C_LASER = "#00ffff";
  this.C_HUD = "#00ffcc";
  this.C_ALERTA = "#ff4444";
  this.C_ACENTO = "#aaffaa";
  this.TEstadoJuego = {"0": "ejEspera", ejEspera: 0, "1": "ejJugando", ejJugando: 1, "2": "ejFin", ejFin: 2};
  this.TBichoTipo = {"0": "btPulgon", btPulgon: 0, "1": "btMoscaBlanca", btMoscaBlanca: 1, "2": "btSaltamontes", btSaltamontes: 2, "3": "btChincheRoja", btChincheRoja: 3};
  rtl.recNewT(this,"TCaja",function () {
    this.X = 0.0;
    this.Y = 0.0;
    this.W = 0.0;
    this.H = 0.0;
    this.$eq = function (b) {
      return (this.X === b.X) && (this.Y === b.Y) && (this.W === b.W) && (this.H === b.H);
    };
    this.$assign = function (s) {
      this.X = s.X;
      this.Y = s.Y;
      this.W = s.W;
      this.H = s.H;
      return this;
    };
  });
  rtl.recNewT(this,"TCangrejo",function () {
    this.X = 0.0;
    this.Y = 0.0;
    this.W = 0.0;
    this.H = 0.0;
    this.Velocidad = 0.0;
    this.$eq = function (b) {
      return (this.X === b.X) && (this.Y === b.Y) && (this.W === b.W) && (this.H === b.H) && (this.Velocidad === b.Velocidad);
    };
    this.$assign = function (s) {
      this.X = s.X;
      this.Y = s.Y;
      this.W = s.W;
      this.H = s.H;
      this.Velocidad = s.Velocidad;
      return this;
    };
  });
  rtl.recNewT(this,"TLaser",function () {
    this.X = 0.0;
    this.Y = 0.0;
    this.W = 0.0;
    this.H = 0.0;
    this.Velocidad = 0.0;
    this.Activo = false;
    this.$eq = function (b) {
      return (this.X === b.X) && (this.Y === b.Y) && (this.W === b.W) && (this.H === b.H) && (this.Velocidad === b.Velocidad) && (this.Activo === b.Activo);
    };
    this.$assign = function (s) {
      this.X = s.X;
      this.Y = s.Y;
      this.W = s.W;
      this.H = s.H;
      this.Velocidad = s.Velocidad;
      this.Activo = s.Activo;
      return this;
    };
  });
  rtl.recNewT(this,"TBicho",function () {
    this.X = 0.0;
    this.Y = 0.0;
    this.W = 0.0;
    this.H = 0.0;
    this.VelX = 0.0;
    this.VelY = 0.0;
    this.FaseZigZag = 0.0;
    this.Tipo = 0;
    this.Vida = 0;
    this.MaxVida = 0;
    this.Activo = false;
    this.$eq = function (b) {
      return (this.X === b.X) && (this.Y === b.Y) && (this.W === b.W) && (this.H === b.H) && (this.VelX === b.VelX) && (this.VelY === b.VelY) && (this.FaseZigZag === b.FaseZigZag) && (this.Tipo === b.Tipo) && (this.Vida === b.Vida) && (this.MaxVida === b.MaxVida) && (this.Activo === b.Activo);
    };
    this.$assign = function (s) {
      this.X = s.X;
      this.Y = s.Y;
      this.W = s.W;
      this.H = s.H;
      this.VelX = s.VelX;
      this.VelY = s.VelY;
      this.FaseZigZag = s.FaseZigZag;
      this.Tipo = s.Tipo;
      this.Vida = s.Vida;
      this.MaxVida = s.MaxVida;
      this.Activo = s.Activo;
      return this;
    };
  });
  this.Canvas = null;
  this.Ctx = null;
  this.EstadoJuego = 0;
  this.Cangrejo = this.TCangrejo.$new();
  this.Lasers$a$clone = function (a) {
    var b = [];
    b.length = 50;
    for (var c = 0; c < 50; c++) b[c] = $mod.TLaser.$clone(a[c]);
    return b;
  };
  this.Lasers = rtl.arraySetLength(null,this.TLaser,50);
  this.Bichos$a$clone = function (a) {
    var b = [];
    b.length = 100;
    for (var c = 0; c < 100; c++) b[c] = $mod.TBicho.$clone(a[c]);
    return b;
  };
  this.Bichos = rtl.arraySetLength(null,this.TBicho,100);
  this.Score = 0;
  this.Vidas = 0;
  this.PlagasEliminadas = 0;
  this.TiempoSpawn = 0.0;
  this.TiempoPrevio = 0.0;
  this.KeyLeft = false;
  this.KeyRight = false;
  this.KeySpace = false;
  this.Boton = this.TCaja.$new();
  this.BotonCaliente = false;
  this.Audio = null;
  this.PuntoEnCaja = function (PX, PY, C) {
    var Result = false;
    Result = (PX >= C.X) && (PX <= (C.X + C.W)) && (PY >= C.Y) && (PY <= (C.Y + C.H));
    return Result;
  };
  this.TextoCentrado = function (S, Y) {
    $mod.Ctx.textAlign = "center";
    $mod.Ctx.fillText(S,800 / 2,Y);
  };
  this.IniciarAudio = function () {
    if ($mod.Audio !== null) {
      if ($mod.Audio.state === "suspended") $mod.Audio.resume();
      return;
    };
    try {
      $mod.Audio = new AudioContext();
    } catch ($e) {
      $mod.Audio = null;
    };
  };
  this.Beep = function (Forma, FIni, FFin, Volumen, Dur, Demora) {
    var Osc = null;
    var Gan = null;
    var T0 = 0.0;
    if ($mod.Audio === null) return;
    T0 = $mod.Audio.currentTime + Demora;
    Osc = $mod.Audio.createOscillator();
    Gan = $mod.Audio.createGain();
    Osc.type = Forma;
    Osc.frequency.setValueAtTime(FIni,T0);
    if (FFin > 0) Osc.frequency.exponentialRampToValueAtTime(FFin,T0 + Dur);
    Gan.gain.setValueAtTime(Volumen,T0);
    Gan.gain.exponentialRampToValueAtTime(0.01,T0 + Dur);
    Osc.connect(Gan);
    Gan.connect($mod.Audio.destination);
    Osc.start(T0);
    Osc.stop(T0 + Dur);
  };
  this.SonidoLaser = function () {
    $mod.Beep("sawtooth",700,150,0.12,0.12,0);
  };
  this.SonidoImpacto = function () {
    $mod.Beep("square",350,90,0.15,0.08,0);
  };
  this.SonidoDanio = function () {
    $mod.Beep("sawtooth",150,40,0.25,0.25,0);
  };
  this.SonidoFin = function () {
    $mod.Beep("triangle",220,210,0.20,0.15,0.00);
    $mod.Beep("triangle",180,170,0.20,0.15,0.15);
    $mod.Beep("triangle",140,130,0.20,0.15,0.30);
    $mod.Beep("triangle",95,90,0.20,0.25,0.45);
  };
  this.PrepararPartida = function () {
    var i = 0;
    $mod.Cangrejo.W = 60;
    $mod.Cangrejo.H = 50;
    $mod.Cangrejo.X = (800 - $mod.Cangrejo.W) / 2;
    $mod.Cangrejo.Y = 380;
    $mod.Cangrejo.Velocidad = 360;
    $mod.Score = 0;
    $mod.Vidas = 3;
    $mod.PlagasEliminadas = 0;
    $mod.TiempoSpawn = 0;
    $mod.KeyLeft = false;
    $mod.KeyRight = false;
    $mod.KeySpace = false;
    for (i = 1; i <= 50; i++) $mod.Lasers[i - 1].Activo = false;
    for (i = 1; i <= 100; i++) $mod.Bichos[i - 1].Activo = false;
  };
  this.SpawnInsecto = function () {
    var i = 0;
    var arbolOrigen = 0;
    var velXBase = 0.0;
    for (i = 1; i <= 100; i++) {
      if (!$mod.Bichos[i - 1].Activo) {
        arbolOrigen = pas.System.Random(2);
        if (arbolOrigen === 0) {
          $mod.Bichos[i - 1].X = 50 + pas.System.Random(60)}
         else $mod.Bichos[i - 1].X = 690 + pas.System.Random(60);
        $mod.Bichos[i - 1].Y = 30 + pas.System.Random(20);
        $mod.Bichos[i - 1].W = 24;
        $mod.Bichos[i - 1].H = 24;
        $mod.Bichos[i - 1].FaseZigZag = Math.random() * 10;
        $mod.Bichos[i - 1].Activo = true;
        $mod.Bichos[i - 1].Tipo = pas.System.Random(4);
        velXBase = 30 + (Math.random() * 90);
        if (arbolOrigen === 1) velXBase = -velXBase;
        var $tmp = $mod.Bichos[i - 1].Tipo;
        if ($tmp === $mod.TBichoTipo.btPulgon) {
          $mod.Bichos[i - 1].Vida = 1;
          $mod.Bichos[i - 1].VelX = velXBase;
          $mod.Bichos[i - 1].VelY = 36 + (Math.random() * 48);
        } else if ($tmp === $mod.TBichoTipo.btMoscaBlanca) {
          $mod.Bichos[i - 1].Vida = 1;
          $mod.Bichos[i - 1].VelX = velXBase * 1.5;
          $mod.Bichos[i - 1].VelY = 36 + (Math.random() * 48);
        } else if ($tmp === $mod.TBichoTipo.btSaltamontes) {
          $mod.Bichos[i - 1].Vida = 2;
          $mod.Bichos[i - 1].VelX = velXBase;
          $mod.Bichos[i - 1].VelY = (36 + (Math.random() * 48)) * 0.7;
        } else if ($tmp === $mod.TBichoTipo.btChincheRoja) {
          $mod.Bichos[i - 1].Vida = 1;
          $mod.Bichos[i - 1].VelX = velXBase * 1.3;
          $mod.Bichos[i - 1].VelY = (36 + (Math.random() * 48)) * 1.25;
        };
        $mod.Bichos[i - 1].MaxVida = $mod.Bichos[i - 1].Vida;
        break;
      };
    };
  };
  this.Disparar = function () {
    var i = 0;
    var primero = 0;
    var segundo = 0;
    primero = 0;
    segundo = 0;
    for (i = 1; i <= 50; i++) if (!$mod.Lasers[i - 1].Activo) {
      if (primero === 0) {
        primero = i}
       else {
        segundo = i;
        break;
      };
    };
    if ((primero === 0) || (segundo === 0)) return;
    $mod.Lasers[primero - 1].X = $mod.Cangrejo.X + 16;
    $mod.Lasers[primero - 1].Y = $mod.Cangrejo.Y + 10;
    $mod.Lasers[primero - 1].W = 4;
    $mod.Lasers[primero - 1].H = 20;
    $mod.Lasers[primero - 1].Velocidad = 540;
    $mod.Lasers[primero - 1].Activo = true;
    $mod.Lasers[segundo - 1].X = ($mod.Cangrejo.X + $mod.Cangrejo.W) - 20;
    $mod.Lasers[segundo - 1].Y = $mod.Cangrejo.Y + 10;
    $mod.Lasers[segundo - 1].W = 4;
    $mod.Lasers[segundo - 1].H = 20;
    $mod.Lasers[segundo - 1].Velocidad = 540;
    $mod.Lasers[segundo - 1].Activo = true;
    $mod.SonidoLaser();
  };
  this.IniciarPartida = function () {
    $mod.IniciarAudio();
    $mod.PrepararPartida();
    $mod.EstadoJuego = $mod.TEstadoJuego.ejJugando;
  };
  this.TeclaAbajo = function (E) {
    var Result = false;
    Result = true;
    var $tmp = $mod.EstadoJuego;
    if ($tmp === $mod.TEstadoJuego.ejEspera) {
      if ((E.code === "Space") || (E.code === "Enter")) {
        $mod.IniciarPartida();
        $mod.KeySpace = true;
      }}
     else if ($tmp === $mod.TEstadoJuego.ejJugando) {
      if (E.code === "ArrowLeft") $mod.KeyLeft = true;
      if (E.code === "ArrowRight") $mod.KeyRight = true;
      if (E.code === "Space") {
        if (!$mod.KeySpace) $mod.Disparar();
        $mod.KeySpace = true;
      };
    } else if ($tmp === $mod.TEstadoJuego.ejFin) if ((E.code === "KeyR") || (E.code === "Enter")) $mod.IniciarPartida();
    if ((E.code === "ArrowLeft") || (E.code === "ArrowRight") || (E.code === "Space") || (E.code === "ArrowUp") || (E.code === "ArrowDown")) E.preventDefault();
    return Result;
  };
  this.TeclaArriba = function (E) {
    var Result = false;
    Result = true;
    if (E.code === "ArrowLeft") $mod.KeyLeft = false;
    if (E.code === "ArrowRight") $mod.KeyRight = false;
    if (E.code === "Space") $mod.KeySpace = false;
    return Result;
  };
  this.ClickEnCanvas = function (E) {
    var Result = false;
    Result = true;
    if ($mod.EstadoJuego === $mod.TEstadoJuego.ejJugando) return Result;
    if ($mod.PuntoEnCaja(E.offsetX,E.offsetY,$mod.Boton)) $mod.IniciarPartida();
    return Result;
  };
  this.MoverMouse = function (E) {
    var Result = false;
    Result = true;
    $mod.BotonCaliente = ($mod.EstadoJuego !== $mod.TEstadoJuego.ejJugando) && $mod.PuntoEnCaja(E.offsetX,E.offsetY,$mod.Boton);
    if ($mod.BotonCaliente) {
      $mod.Canvas.style.setProperty("cursor","pointer")}
     else $mod.Canvas.style.setProperty("cursor","default");
    return Result;
  };
  this.Actualizar = function (dt) {
    var i = 0;
    var l = 0;
    var b = 0;
    var intervalo = 0.0;
    if ($mod.KeyLeft && ($mod.Cangrejo.X > 10)) $mod.Cangrejo.X = $mod.Cangrejo.X - ($mod.Cangrejo.Velocidad * dt);
    if ($mod.KeyRight && ($mod.Cangrejo.X < (800 - $mod.Cangrejo.W - 10))) $mod.Cangrejo.X = $mod.Cangrejo.X + ($mod.Cangrejo.Velocidad * dt);
    for (i = 1; i <= 50; i++) if ($mod.Lasers[i - 1].Activo) {
      $mod.Lasers[i - 1].Y = $mod.Lasers[i - 1].Y - ($mod.Lasers[i - 1].Velocidad * dt);
      if (($mod.Lasers[i - 1].Y + $mod.Lasers[i - 1].H) < 0) $mod.Lasers[i - 1].Activo = false;
    };
    $mod.TiempoSpawn = $mod.TiempoSpawn + dt;
    intervalo = Math.max(0.5,1.5 - (rtl.trunc($mod.PlagasEliminadas / 5) * 0.08));
    if ($mod.TiempoSpawn >= intervalo) {
      $mod.SpawnInsecto();
      $mod.TiempoSpawn = 0;
    };
    for (i = 1; i <= 100; i++) if ($mod.Bichos[i - 1].Activo) {
      $mod.Bichos[i - 1].Y = $mod.Bichos[i - 1].Y + ($mod.Bichos[i - 1].VelY * dt);
      if ($mod.Bichos[i - 1].Tipo === $mod.TBichoTipo.btMoscaBlanca) {
        $mod.Bichos[i - 1].FaseZigZag = $mod.Bichos[i - 1].FaseZigZag + (6 * dt);
        $mod.Bichos[i - 1].X = $mod.Bichos[i - 1].X + (Math.sin($mod.Bichos[i - 1].FaseZigZag) * 120 * dt);
      } else {
        $mod.Bichos[i - 1].X = $mod.Bichos[i - 1].X + ($mod.Bichos[i - 1].VelX * dt);
        if ($mod.Bichos[i - 1].X < 20) {
          $mod.Bichos[i - 1].X = 20;
          $mod.Bichos[i - 1].VelX = -$mod.Bichos[i - 1].VelX;
        } else if (($mod.Bichos[i - 1].X + $mod.Bichos[i - 1].W) > (800 - 20)) {
          $mod.Bichos[i - 1].X = 800 - 20 - $mod.Bichos[i - 1].W;
          $mod.Bichos[i - 1].VelX = -$mod.Bichos[i - 1].VelX;
        };
      };
      if (($mod.Bichos[i - 1].Y + $mod.Bichos[i - 1].H) >= 430) {
        $mod.Bichos[i - 1].Activo = false;
        if ($mod.Vidas > 0) $mod.Vidas -= 1;
        $mod.SonidoDanio();
        if ($mod.Vidas <= 0) {
          $mod.Vidas = 0;
          $mod.EstadoJuego = $mod.TEstadoJuego.ejFin;
          $mod.SonidoFin();
        };
      };
    };
    for (l = 1; l <= 50; l++) if ($mod.Lasers[l - 1].Activo) for (b = 1; b <= 100; b++) if ($mod.Bichos[b - 1].Activo) if (($mod.Lasers[l - 1].X < ($mod.Bichos[b - 1].X + $mod.Bichos[b - 1].W)) && (($mod.Lasers[l - 1].X + $mod.Lasers[l - 1].W) > $mod.Bichos[b - 1].X) && ($mod.Lasers[l - 1].Y < ($mod.Bichos[b - 1].Y + $mod.Bichos[b - 1].H)) && (($mod.Lasers[l - 1].Y + $mod.Lasers[l - 1].H) > $mod.Bichos[b - 1].Y)) {
      $mod.Lasers[l - 1].Activo = false;
      $mod.Bichos[b - 1].Vida -= 1;
      $mod.SonidoImpacto();
      if ($mod.Bichos[b - 1].Vida <= 0) {
        var $tmp = $mod.Bichos[b - 1].Tipo;
        if ($tmp === $mod.TBichoTipo.btPulgon) {
          $mod.Score += 10}
         else if ($tmp === $mod.TBichoTipo.btMoscaBlanca) {
          $mod.Score += 20}
         else if ($tmp === $mod.TBichoTipo.btSaltamontes) {
          $mod.Score += 30}
         else if ($tmp === $mod.TBichoTipo.btChincheRoja) $mod.Score += 45;
        $mod.Bichos[b - 1].Activo = false;
        $mod.PlagasEliminadas += 1;
      };
      break;
    };
  };
  this.DibujarEscenario = function () {
    var xPos = 0;
    $mod.Ctx.fillStyle = $mod.C_FONDO;
    $mod.Ctx.fillRect(0,0,800,500);
    $mod.Ctx.fillStyle = $mod.C_TRONCO;
    $mod.Ctx.fillRect(0,0,40,120);
    $mod.Ctx.fillRect(800 - 40,0,40,120);
    $mod.Ctx.fillStyle = $mod.C_COPA;
    $mod.Ctx.beginPath();
    $mod.Ctx.arc(40,60,60,0,2 * Math.PI);
    $mod.Ctx.fill();
    $mod.Ctx.beginPath();
    $mod.Ctx.arc(800 - 40,60,60,0,2 * Math.PI);
    $mod.Ctx.fill();
    $mod.Ctx.fillStyle = $mod.C_TIERRA;
    $mod.Ctx.fillRect(30,430,740,500 - 430);
    $mod.Ctx.fillStyle = $mod.C_TIERRA_OSC;
    $mod.Ctx.fillRect(30 + 10,430 + 8,740 - 20,500 - 430 - 8);
    xPos = 70;
    while (xPos < 750) {
      $mod.Ctx.fillStyle = "#228b22";
      $mod.Ctx.fillRect(xPos,442,6,30);
      $mod.Ctx.fillStyle = "#ff2222";
      $mod.Ctx.beginPath();
      $mod.Ctx.arc(xPos - 3,452,4,0,2 * Math.PI);
      $mod.Ctx.fill();
      $mod.Ctx.beginPath();
      $mod.Ctx.arc(xPos + 8,462,4,0,2 * Math.PI);
      $mod.Ctx.fill();
      $mod.Ctx.fillStyle = "#52c652";
      $mod.Ctx.beginPath();
      $mod.Ctx.arc(xPos + 20,470,10,0,2 * Math.PI);
      $mod.Ctx.fill();
      $mod.Ctx.fillStyle = "#2eb82e";
      $mod.Ctx.beginPath();
      $mod.Ctx.arc(xPos + 20,470,6,0,2 * Math.PI);
      $mod.Ctx.fill();
      xPos = xPos + 55;
    };
  };
  this.DibujarCangrejo = function () {
    var cx = 0.0;
    var cy = 0.0;
    var w = 0.0;
    var h = 0.0;
    var desp = 0;
    cx = $mod.Cangrejo.X;
    cy = $mod.Cangrejo.Y;
    w = $mod.Cangrejo.W;
    h = $mod.Cangrejo.H;
    $mod.Ctx.strokeStyle = $mod.C_PINZA;
    $mod.Ctx.lineWidth = 4;
    for (desp = -12; desp <= 12; desp++) if ((desp % 8) === 0) {
      $mod.Ctx.beginPath();
      $mod.Ctx.moveTo(cx + 15,cy + (h * 0.7));
      $mod.Ctx.lineTo(cx + desp,cy + (h * 1.04));
      $mod.Ctx.stroke();
      $mod.Ctx.beginPath();
      $mod.Ctx.moveTo((cx + w) - 15,cy + (h * 0.7));
      $mod.Ctx.lineTo((cx + w) - desp,cy + (h * 1.04));
      $mod.Ctx.stroke();
    };
    $mod.Ctx.fillStyle = $mod.C_PINZA;
    $mod.Ctx.fillRect(cx - 14,cy + 6,16,26);
    $mod.Ctx.fillRect(cx - 20,cy - 12,18,20);
    $mod.Ctx.fillRect((cx + w) - 2,cy + 6,16,26);
    $mod.Ctx.fillRect(cx + w + 2,cy - 12,18,20);
    $mod.Ctx.fillStyle = $mod.C_CANGREJO;
    $mod.Ctx.fillRect(cx - 20,cy - 24,6,14);
    $mod.Ctx.fillRect(cx - 10,cy - 20,6,10);
    $mod.Ctx.fillRect(cx + w + 14,cy - 24,6,14);
    $mod.Ctx.fillRect(cx + w + 4,cy - 20,6,10);
    $mod.Ctx.fillStyle = $mod.C_CANGREJO;
    $mod.Ctx.beginPath();
    $mod.Ctx.ellipse(cx + (w / 2),cy + (h * 0.5),w / 2,h * 0.34,0,0,2 * Math.PI);
    $mod.Ctx.fill();
    $mod.Ctx.fillStyle = $mod.C_OJO;
    $mod.Ctx.fillRect(cx + 14,cy - 4,8,14);
    $mod.Ctx.fillRect((cx + w) - 22,cy - 4,8,14);
    $mod.Ctx.fillStyle = "#ffffff";
    $mod.Ctx.beginPath();
    $mod.Ctx.arc(cx + 18,cy - 6,5,0,2 * Math.PI);
    $mod.Ctx.fill();
    $mod.Ctx.beginPath();
    $mod.Ctx.arc((cx + w) - 18,cy - 6,5,0,2 * Math.PI);
    $mod.Ctx.fill();
    $mod.Ctx.fillStyle = "#000000";
    $mod.Ctx.beginPath();
    $mod.Ctx.arc(cx + 18,cy - 8,2.5,0,2 * Math.PI);
    $mod.Ctx.fill();
    $mod.Ctx.beginPath();
    $mod.Ctx.arc((cx + w) - 18,cy - 8,2.5,0,2 * Math.PI);
    $mod.Ctx.fill();
  };
  this.DibujarLasers = function () {
    var i = 0;
    for (i = 1; i <= 50; i++) if ($mod.Lasers[i - 1].Activo) {
      $mod.Ctx.fillStyle = "rgba(0,255,255,0.35)";
      $mod.Ctx.fillRect($mod.Lasers[i - 1].X - 2,$mod.Lasers[i - 1].Y,$mod.Lasers[i - 1].W + 4,$mod.Lasers[i - 1].H);
      $mod.Ctx.fillStyle = $mod.C_LASER;
      $mod.Ctx.fillRect($mod.Lasers[i - 1].X,$mod.Lasers[i - 1].Y,$mod.Lasers[i - 1].W,$mod.Lasers[i - 1].H);
    };
  };
  this.DibujarBichos = function () {
    var i = 0;
    var radio = 0.0;
    for (i = 1; i <= 100; i++) if ($mod.Bichos[i - 1].Activo) {
      var $tmp = $mod.Bichos[i - 1].Tipo;
      if ($tmp === $mod.TBichoTipo.btPulgon) {
        $mod.Ctx.fillStyle = "#3ae33a"}
       else if ($tmp === $mod.TBichoTipo.btMoscaBlanca) {
        $mod.Ctx.fillStyle = "#ffffff"}
       else if ($tmp === $mod.TBichoTipo.btSaltamontes) {
        $mod.Ctx.fillStyle = "#eedd22"}
       else if ($tmp === $mod.TBichoTipo.btChincheRoja) $mod.Ctx.fillStyle = "#ff2222";
      radio = $mod.Bichos[i - 1].W / 2;
      $mod.Ctx.beginPath();
      $mod.Ctx.arc($mod.Bichos[i - 1].X + radio,$mod.Bichos[i - 1].Y + radio,radio,0,2 * Math.PI);
      $mod.Ctx.fill();
      $mod.Ctx.fillStyle = "#000000";
      $mod.Ctx.fillRect($mod.Bichos[i - 1].X + 6,$mod.Bichos[i - 1].Y + 6,3,3);
      $mod.Ctx.fillRect(($mod.Bichos[i - 1].X + $mod.Bichos[i - 1].W) - 9,$mod.Bichos[i - 1].Y + 6,3,3);
      if (($mod.Bichos[i - 1].MaxVida > 1) && ($mod.Bichos[i - 1].Vida < $mod.Bichos[i - 1].MaxVida)) {
        $mod.Ctx.fillStyle = "#ff0000";
        $mod.Ctx.fillRect($mod.Bichos[i - 1].X,$mod.Bichos[i - 1].Y - 8,$mod.Bichos[i - 1].W,4);
        $mod.Ctx.fillStyle = "#00ff00";
        $mod.Ctx.fillRect($mod.Bichos[i - 1].X,$mod.Bichos[i - 1].Y - 8,$mod.Bichos[i - 1].W * ($mod.Bichos[i - 1].Vida / $mod.Bichos[i - 1].MaxVida),4);
      };
    };
  };
  this.DibujarHUD = function () {
    $mod.Ctx.font = "bold 16px monospace";
    $mod.Ctx.textBaseline = "top";
    $mod.Ctx.textAlign = "left";
    $mod.Ctx.fillStyle = $mod.C_HUD;
    $mod.Ctx.fillText("PUNTOS: " + pas.SysUtils.IntToStr($mod.Score),100,14);
    $mod.Ctx.textAlign = "center";
    $mod.Ctx.fillStyle = $mod.C_ALERTA;
    $mod.Ctx.fillText("VIDAS: " + pas.SysUtils.IntToStr($mod.Vidas),800 / 2,14);
    $mod.Ctx.textAlign = "right";
    $mod.Ctx.fillStyle = $mod.C_ACENTO;
    $mod.Ctx.fillText("PLAGAS: " + pas.SysUtils.IntToStr($mod.PlagasEliminadas),800 - 100,14);
    $mod.Ctx.textBaseline = "alphabetic";
    $mod.Ctx.textAlign = "left";
  };
  this.DibujarBoton = function (Texto) {
    if ($mod.BotonCaliente) {
      $mod.Ctx.fillStyle = "#00ffcc"}
     else $mod.Ctx.fillStyle = "#00b894";
    $mod.Ctx.fillRect($mod.Boton.X,$mod.Boton.Y,$mod.Boton.W,$mod.Boton.H);
    $mod.Ctx.strokeStyle = "#ffffff";
    $mod.Ctx.lineWidth = 2;
    $mod.Ctx.strokeRect($mod.Boton.X,$mod.Boton.Y,$mod.Boton.W,$mod.Boton.H);
    $mod.Ctx.fillStyle = "#062018";
    $mod.Ctx.font = "bold 22px monospace";
    $mod.Ctx.textAlign = "center";
    $mod.Ctx.textBaseline = "middle";
    $mod.Ctx.fillText(Texto,$mod.Boton.X + ($mod.Boton.W / 2),$mod.Boton.Y + ($mod.Boton.H / 2));
    $mod.Ctx.textBaseline = "alphabetic";
  };
  this.DibujarPantallaInicio = function () {
    $mod.Ctx.fillStyle = "rgba(4,10,20,0.88)";
    $mod.Ctx.fillRect(0,0,800,500);
    $mod.Ctx.fillStyle = $mod.C_ALERTA;
    $mod.Ctx.font = "bold 46px monospace";
    $mod.TextoCentrado("CRAB INVADERS",120);
    $mod.Ctx.fillStyle = $mod.C_HUD;
    $mod.Ctx.font = "bold 26px monospace";
    $mod.TextoCentrado("THE BANCAL DEFENDER",158);
    $mod.Ctx.fillStyle = "#ffffff";
    $mod.Ctx.font = "17px monospace";
    $mod.TextoCentrado("FLECHAS  ←  →    mover el cangrejo",232);
    $mod.TextoCentrado("BARRA ESPACIADORA    disparar",262);
    $mod.Ctx.fillStyle = "#9aa5b5";
    $mod.Ctx.font = "14px monospace";
    $mod.TextoCentrado("Defendé el bancal: si una plaga toca la tierra, perdés una vida.",300);
    $mod.TextoCentrado("El sonido se activa al empezar.",322);
    $mod.DibujarBoton("INICIAR");
  };
  this.DibujarPantallaFin = function () {
    $mod.Ctx.fillStyle = "rgba(0,0,0,0.85)";
    $mod.Ctx.fillRect(0,0,800,500);
    $mod.Ctx.fillStyle = "#ff3333";
    $mod.Ctx.font = "bold 40px monospace";
    $mod.TextoCentrado("¡FIN DEL JUEGO!",170);
    $mod.Ctx.fillStyle = "#ffffff";
    $mod.Ctx.font = "18px monospace";
    $mod.TextoCentrado("Las plagas rompieron la defensa e invadieron el bancal.",212);
    $mod.Ctx.fillStyle = $mod.C_HUD;
    $mod.Ctx.font = "bold 22px monospace";
    $mod.TextoCentrado("Puntuación total: " + pas.SysUtils.IntToStr($mod.Score) + " pts",256);
    $mod.Ctx.fillStyle = "#9aa5b5";
    $mod.Ctx.font = "14px monospace";
    $mod.TextoCentrado("También podés apretar R",300);
    $mod.DibujarBoton("JUGAR DE NUEVO");
  };
  this.Render = function () {
    $mod.DibujarEscenario();
    $mod.DibujarCangrejo();
    $mod.DibujarLasers();
    $mod.DibujarBichos();
    $mod.DibujarHUD();
    var $tmp = $mod.EstadoJuego;
    if ($tmp === $mod.TEstadoJuego.ejEspera) {
      $mod.DibujarPantallaInicio()}
     else if ($tmp === $mod.TEstadoJuego.ejFin) {
      $mod.DibujarPantallaFin()}
     else if ($tmp === $mod.TEstadoJuego.ejJugando) ;
  };
  this.GameLoop = function (TimeStamp) {
    var dt = 0.0;
    if ($mod.TiempoPrevio === 0) $mod.TiempoPrevio = TimeStamp;
    dt = (TimeStamp - $mod.TiempoPrevio) / 1000;
    $mod.TiempoPrevio = TimeStamp;
    if (dt > 0.05) dt = 0.05;
    if ($mod.EstadoJuego === $mod.TEstadoJuego.ejJugando) $mod.Actualizar(dt);
    $mod.Render();
    window.requestAnimationFrame($mod.GameLoop);
  };
  $mod.$main = function () {
    $mod.Canvas = document.getElementById("gameCanvas");
    $mod.Ctx = $mod.Canvas.getContext("2d");
    document.onkeydown = rtl.createSafeCallback($mod,"TeclaAbajo");
    document.onkeyup = rtl.createSafeCallback($mod,"TeclaArriba");
    $mod.Canvas.onclick = rtl.createSafeCallback($mod,"ClickEnCanvas");
    $mod.Canvas.onmousemove = rtl.createSafeCallback($mod,"MoverMouse");
    $mod.Boton.W = 240;
    $mod.Boton.H = 54;
    $mod.Boton.X = (800 - $mod.Boton.W) / 2;
    $mod.Boton.Y = 350;
    $mod.BotonCaliente = false;
    $mod.Audio = null;
    $mod.TiempoPrevio = 0;
    $mod.PrepararPartida();
    $mod.EstadoJuego = $mod.TEstadoJuego.ejEspera;
    window.requestAnimationFrame($mod.GameLoop);
  };
});

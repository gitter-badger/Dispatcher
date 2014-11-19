var uriTemplate = require("uri-templates");

var _match_order = [
	"uri",
	"method",
];

var Dispatcher= function(port, ip) {
	if(port != null)
		this.port = port;
	if(ip != null)
		this.ip = ip;
	this.routes = [];
	this.namedRoutes = {};
	this.importedTemplates = false;
}

Dispatcher.prototype = {
	port:	8080,
	ip:	'127.0.0.1',
	start:	function(port, ip) {
		var http = require('http');
		
		http.createServer(function (req, res) {
			this.dispatch(req, res);
		}.bind(this)).listen(
			port || this.port,
			ip || this.ip
		);
		console.log("Connect at http://" + (ip || this.ip) + ":" + (port || this.port));
	},
	importTemplates:	function() {
		Dispatcher.importTemplates.call(this);
		this.importedTemplates = true;
	},
	firstRoute:	function() {
		var new_route = new Dispatcher.Route(this);
		this.routes.unshift(new_route);
		return new_route;
	},
	route:	function() {
		var new_route = new Dispatcher.Route(this);
		this.routes.push(new_route);
		return new_route;
	},
	dispatch:	function(request, response) {
		var route;
		//console.log(request);
		var matches = this._prepare_routes(this.routes);
		_match_order.forEach(function(attr){
			var newMatches = [];
			matches.forEach(function(proute){
				if(proute.match(attr, request)) {
					newMatches.push(proute);
				}
			});
			matches = newMatches;
		});

		if(matches.length > 0) {
			route =  matches[0];
		} else {
			route = new Dispatcher.PreparedRoute(new Dispatcher.Route().uri("").handler(Dispatcher.notFoundHandler));
		}
		//console.log(route.toString());
		route.handle(request, response);
		route.render(request, response);
		return;
	},
	_prepare_routes:	function(routes) {
		var prepared = [];
		routes.forEach(function(route){
			this.push(new Dispatcher.PreparedRoute(route));
		}.bind(prepared));
		return prepared;
	},
};

Dispatcher.notFoundHandler = function(request, response) {
	response.writeHead(404, {'Content-Type': 'text/plain'});
	response.end("404 not found");
};

Dispatcher._match_method	= function(request) {
	//console.log(this.method + " == " + request.method);
	if(this.method == null || this.method.length == 0) return true;
	return this.method.indexOf(request.method) >= 0;
};

Dispatcher._match_uri	= function(request) {
	//console.log(this.uri + " == " + request.url);
	if(this.uri == null || this.uri.length == 0) return true;
	var found = false;
	(this.uri || []).forEach(function(uri){
		var data = uriTemplate(uri).fromUri(request.url);
		if(data != null) {
			for(var key in data) {
				this.params[key] = this.stash[key] = data[key];
			}
			found = true;
		}
	}.bind(this));
	return found;
};

Dispatcher.importTemplates = function() {
	var Template = require("template");
	this.template = new Template();
	this.template.pages("templates/*.tmpl");
};

Dispatcher.render = function(template, data, cb) {
	this.template.render(template, data, cb);
}

Dispatcher.defaultHandler = function(request, response) {
	//console.log(request.method + " " + request.url);
	var handlers = this.route._handler;
	if(typeof handlers == typeof function(){})
		handlers = [handlers];
	if(typeof handlers == typeof [])
		handlers.forEach(function loop(handler){
			if(loop.stop) return;
			var ret = handler.call(this, request, response)
			if(ret === false) loop.stop = true;
		}.bind(this));
};

Dispatcher.prototype.newRoute = Dispatcher.prototype.route;

Dispatcher.PreparedRoute = function(route) {
	this.route	= route;
	this.router	= route.router;
	this.stash	= {};
	this.params	= {};
}

Dispatcher.PreparedRoute.prototype = {
	match:	function(attr, request) {
		var hash	= this.route.toHash();
		hash.stash	= this.stash;
		hash.params	= this.params;
		return Dispatcher["_match_" + attr].call(hash, request);
	},
	handle:		function(request, response) {
		return Dispatcher.defaultHandler.call(this, request, response);
	},
	render:		function(request, response) {
		//console.log(request.method + " " + request.url);
		var renders = this.route._render;
		if(typeof renders == typeof function(){})
			renders = [renders];
		if(typeof renders == typeof [])
			renders.forEach(function(renders){
				renders.call(this, request, response)
			}.bind(this));
	},
	request: function(method, uri, data, mapper) {
		console.log(method, uri, data, mapper);
		throw "request not implemented yet";
	},
};

Dispatcher.Route = function(router) {
	this.router = router;
}

Dispatcher.Route.prototype = {
	toString:	function() {
		return this._method + " -> " + this._uri;
	},
	newRoute:	function() {
		return this.router.newRoute()
	},
	toHash:		function() {
		var hash = {};
		for(var key in this) {
			if(key.substr(0, 1) === "_") {
				hash[key.substr(1)] = this[key];
			}
		}
		return hash;
	},
	_handler:	function(request, response) {
		//console.log("custom handler");
		response.writeHead(200, {'Content-Type': 'text/plain'});
		response.end("DEFAULT HANDLER: " + this.route.toString());
	},
	render:		function(template, fixedData) {
		if(typeof this._handler != typeof [])
			this._handler = [];
		if(!this.router.importedTemplates) {
			this.router.importTemplates();
		}
		if(typeof this._render != typeof [])
			this._render = [];

		this._render.push(function(request, response){
			var data = {};
			for(var key in fixedData) {
				data[key] = fixedData[key];
			}
			for(var key in this.stash) {
				data[key] = this.stash[key];
			}
			Dispatcher.render.call(this.router, template, data, function(err, html){
				if(err) throw err;
				response.writeHead(200, {'Content-Type': 'text/html'});
				response.end(html);
			});
		});
		return this;
	},
	request:	function(method, uri, data, mapper) {
		if(typeof this._handler != typeof [])
			this._handler = [];
		this._handler.push(function(request, result){
			this.request(method, uri, data, mapper);
		});
		return this;
	},
	name:		function(name) {
		this.name = name;
		this.router.namedRoutes[name] = this;
		return this;
	},
	stash2json:	function(mapper) {
		if(typeof this._handler != typeof [])
			this._handler = [];
		this._handler.push(function(request, result){
			var data;
			if(mapper == null) {
				data = this.stash;
			} else if(typeof mapper == typeof []) {
				mapper.forEach(function(key){
					data[key] = this.stash[key];
				});
			} else if(typeof mapper == typeof {}) {
				for(var key in mapper) {
					data[mapper[key]] = this.stash[key];
				}
			} else {
				data = this.stash[mapper];
			}
			result.end(JSON.stringify(data));
		});
		return this;
	},
};

function _setSetter(name, value) {
	this[name] = function(value){
		var attr = "_" + name;
		if(typeof this[attr] != typeof [])
			this[attr] = [];
		if(name == "handler" && typeof value == typeof "")
			value = require(value);
		this[attr].push(value);
		return this;
	};
}

_setSetter.call(Dispatcher.Route.prototype, "method");
_setSetter.call(Dispatcher.Route.prototype, "uri");
_setSetter.call(Dispatcher.Route.prototype, "handler");

module.exports = Dispatcher;
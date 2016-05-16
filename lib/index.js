'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

module.exports = neuron;

var parse_module_id = require('module-id');
var Walker = require('./walker');

function neuron(options) {
  return new Neuron(options);
}

function NOOP() {}

var USER_CONFIGS = ['path', 'resolve'];

var Neuron = function () {
  function Neuron(_ref) {
    var resolve = _ref.resolve;
    var dependency_tree = _ref.dependency_tree;
    var js_config = _ref.js_config;
    var debug = _ref.debug;

    _classCallCheck(this, Neuron);

    this._facades = [];
    this._csses = [];

    this._is_debug = typeof debug === 'function' ? debug : function () {
      return !!debug;
    };

    this.resolve = typeof resolve === 'function' ? resolve : Neuron._default_resolver;

    this.dependency_tree = dependency_tree;
    this.js_config = js_config;

    this._loaded = [];

    this._walker = new Walker(dependency_tree);
  }

  _createClass(Neuron, [{
    key: 'singleton',
    value: function singleton() {
      var _this = this;

      var ret = {};['facade', 'css', 'js', 'src', 'output_neuron', 'output_css', 'output_config', 'output_scripts', 'output_facades'].forEach(function (method) {
        ret[method] = function () {
          return _this[method].apply(_this, arguments);
        };
      });

      return ret;
    }
  }, {
    key: '_analyze',
    value: function _analyze() {
      this._analyze = NOOP;

      var facade_module_ids = this._facades.map(function (facade) {
        return facade.id;
      });

      var _walker$look_up = this._walker.look_up(facade_module_ids);

      var packages = _walker$look_up.packages;
      var graph = _walker$look_up.graph;


      this._packages = packages;
      this._graph = graph;
    }
  }, {
    key: 'facade',
    value: function facade(id, data) {
      this._facades.push({
        id: id,
        data: data
      });
      return '';
    }

    // @param {Boolean} inline, TODO

  }, {
    key: 'js',
    value: function js(_js) {
      var src = this.src(_js);
      return this._decorate(src, 'js');
    }

    // @param {Boolean} inline, TODO

  }, {
    key: 'css',
    value: function css(_css) {
      this._csses.push(_css);
      return '';
    }
  }, {
    key: 'src',
    value: function src(id) {
      var parsed = parse_module_id(id);
      var name = parsed.name;
      var version = parsed.version;


      version = this._walker.resolve_range(name, version);
      if (version) {
        parsed.version = version;
      }

      return this.resolve(parsed.normalize_url());
    }
  }, {
    key: 'output_neuron',
    value: function output_neuron() {
      this._analyze();

      return this._decorate('/s/neuron.js', 'js');
    }
  }, {
    key: 'output_css',
    value: function output_css() {
      var _this2 = this;

      this._analyze();

      return this._csses.map(function (id) {
        var href = _this2.src(id);
        return _this2._decorate(href, 'css');
      }).join('\n');
    }

    // @param {String} link link resource
    // @param {String} type
    // @param {Boolean} inline whether should output resources inline

  }, {
    key: '_decorate',
    value: function _decorate(link, type, extra) {
      if (type === 'css') {
        return '<link rel="stylesheet" href="' + link + '">';
      }

      if (extra) {
        extra = ' ' + extra;
      }

      if (type === 'js') {
        return '<script src="' + link + '"' + extra + '></script>';
      }
    }
  }, {
    key: 'output_config',
    value: function output_config() {
      this._analyze();

      var config = this._is_debug() ? {} : {
        loaded: this._json_stringify(this._loaded),
        graph: this._json_stringify(this._graph)
      };

      USER_CONFIGS.forEach(function (key) {
        var c = tihs.js_config[key];
        if (c) {
          config[key] = c;
        }
      });

      var joiner = ',' + this._get_joiner();

      var config_pair = Object.keys(config).map(function (key) {
        return key + ':' + config[key];
      }).join(joiner);

      return '<script>neuron.config({' + config_pair + '})</script>';
    }
  }, {
    key: 'output_scripts',
    value: function output_scripts() {
      var _this3 = this;

      if (this._is_debug()) {
        return '';
      }

      this._analyze();

      var output = [];

      Object.keys(this._packages).forEach(function (name) {
        var _packages$name = _this3._packages[name];
        var version = _packages$name.version;
        var path = _packages$name.path;


        var id = parse_module_id(name, version, path);

        _this3._set_loaded(id);
        _this3._decorate_script(output, id);
      });

      return output.join(this._get_joiner());
    }
  }, {
    key: '_get_joiner',
    value: function _get_joiner() {
      return this._is_debug() ? '\n' : '';
    }
  }, {
    key: '_decorate_script',
    value: function _decorate_script(output, id) {
      var src = this.src(id);
      output.push(this._decorate(src, 'js', 'async'));
    }
  }, {
    key: '_set_loaded',
    value: function _set_loaded(id) {
      self._loaded.push(id.pkg);
    }
  }, {
    key: 'output_facades',
    value: function output_facades() {
      var _this4 = this;

      this._analyze();

      var is_debug = this._is_debug();

      return ['<script>', this._facades.map(function (facade) {
        if (!facade.data) {
          return 'facade(\'' + facade.id + '\')';
        }

        var data = _this4._json_stringify(facade.data);
        return 'facade(\'' + facade.id + '\', ' + data + ')';
      }).join('\n'), '</script>'].join('\n');
    }
  }, {
    key: '_json_stringify',
    value: function _json_stringify(subject) {
      return this.is_debug() ? JSON.stringify(facade.data, null, 2) : JSON.stringify(facade.data);
    }
  }]);

  return Neuron;
}();

Neuron._default_resolver = function (pathname) {
  return '/' + pathname;
};
'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

module.exports = neuron;

var parse_module_id = require('module-id');
var Walker = require('./walker');
var unique = require('array-unique');

var code = require('code-stringify');
code.QUOTE = '\'';

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

    this._is_debug = debug;
    this._joiner = this._get_joiner();

    this.resolve = typeof resolve === 'function' ? resolve : Neuron._default_resolver;

    this.dependency_tree = dependency_tree;
    this.js_config = js_config || {};

    this._loaded = [];

    this._walker = new Walker(dependency_tree);
  }

  _createClass(Neuron, [{
    key: 'singleton',
    value: function singleton() {
      var _this = this;

      var ret = {};[['facade', 0], ['css', 0], ['analyze', 0], ['src', 0], ['js', 1], ['output_neuron', 1], ['output_css', 1], ['output_config', 1], ['output_scripts', 1], ['output_facades', 1]].forEach(function (_ref2) {
        var _ref3 = _slicedToArray(_ref2, 2);

        var method = _ref3[0];
        var output = _ref3[1];

        ret[method] = function () {
          return _this[method].apply(_this, arguments) + (output ? _this._joiner : '');
        };
      });

      return ret;
    }
  }, {
    key: 'analyze',
    value: function analyze() {
      this.analyze = NOOP;

      var facade_module_ids = this._facades.map(function (facade) {
        return facade.id;
      });

      var _walker$look_up = this._walker.look_up(facade_module_ids);

      var packages = _walker$look_up.packages;
      var graph = _walker$look_up.graph;


      this._packages = packages;
      this._graph = graph;

      return '';
    }
  }, {
    key: 'facade',
    value: function facade(id, data) {
      this._facades.push({
        id: id,
        data: data
      });
      return this._joiner;
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

      return this._src(parsed);
    }
  }, {
    key: '_src',
    value: function _src(parsed) {
      return this.resolve(parsed.url);
    }
  }, {
    key: 'output_neuron',
    value: function output_neuron() {
      return this._decorate(this.resolve('neuron.js'), 'js');
    }
  }, {
    key: 'output_css',
    value: function output_css() {
      var _this2 = this;

      return this._csses.map(function (id) {
        var href = _this2.src(id);
        return _this2._decorate(href, 'css');
      }).join(this._joiner);
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

      extra = extra ? ' ' + extra : '';

      if (type === 'js') {
        return '<script src="' + link + '"' + extra + '></script>';
      }
    }
  }, {
    key: 'output_config',
    value: function output_config() {
      var _this3 = this;

      var config = {};

      USER_CONFIGS.forEach(function (key) {
        var c = _this3.js_config[key];
        if (c) {
          config[key] = c;
        }
      });

      config.loaded = unique(this._loaded);
      config.graph = this._graph;

      var config_string = this._is_debug ? code(config, null, 2) : code(config);

      return '<script>neuron.config(' + config_string + ')</script>';
    }
  }, {
    key: 'output_scripts',
    value: function output_scripts() {
      var _this4 = this;

      if (this._is_debug) {
        return this._joiner;
      }

      var output = [];

      Object.keys(this._packages).forEach(function (name) {
        var _packages$name = _this4._packages[name];
        var version = _packages$name.version;
        var path = _packages$name.path;


        var id = parse_module_id(name);
        id.version = version;
        id.path = path;

        _this4._set_loaded(id);
        _this4._decorate_script(output, id);
      });

      return output.join(this._joiner);
    }
  }, {
    key: '_get_joiner',
    value: function _get_joiner() {
      return this._is_debug ? '\n' : '';
    }
  }, {
    key: '_decorate_script',
    value: function _decorate_script(output, id) {
      var src = this._src(id);
      output.push(this._decorate(src, 'js', 'async'));
    }
  }, {
    key: '_set_loaded',
    value: function _set_loaded(id) {
      this._loaded.push(id.id);
    }
  }, {
    key: 'output_facades',
    value: function output_facades() {
      var _this5 = this;

      var divider = this._is_debug ? '\n' : ';';

      return ['<script>', this._facades.map(function (facade) {
        if (!facade.data) {
          return 'facade(\'' + facade.id + '\')';
        }

        var data = _this5._json_stringify(facade.data);
        return 'facade(\'' + facade.id + '\', ' + data + ')';
      }).join(), '</script>'].join(this._joiner);
    }
  }, {
    key: '_json_stringify',
    value: function _json_stringify(subject) {
      return this._is_debug ? JSON.stringify(subject, null, 2) : JSON.stringify(subject);
    }
  }]);

  return Neuron;
}();

Neuron._default_resolver = function (pathname) {
  return '/' + pathname;
};
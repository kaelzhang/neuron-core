'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var parse_module_id = require('module-id');
var semver = require('semver');
var access = require('object-access');

var Walker = function () {
  function Walker(tree) {
    _classCallCheck(this, Walker);

    this._tree = tree || {};
    this.guid = 0;
  }

  _createClass(Walker, [{
    key: '_guid',
    value: function _guid() {
      return this.guid++;
    }
  }, {
    key: 'look_up',
    value: function look_up(facades) {
      var _this = this;

      this.parsed = [];
      var facade_node = {};

      // `this.selected` has the structure like:
      // {
      //     '<name>': set([
      //         ('<version>', '<path>')
      //     ])
      // }
      this.selected = {};

      // see [here](https://github.com/kaelzhang/neuron/blob/master/doc/graph.md)
      this.graph = {
        _: facade_node
      };

      // map to store the index of the dependency node
      this.index_map = {};

      facades.forEach(function (id) {
        var parsed = parse_module_id(id);
        // If the module id facaded contains path, the path will be ignored
        _this._walk_down_facade(parsed.name, parsed.version || '*', parsed.path || '', facade_node);
      });

      return {
        packages: this.selected,
        graph: this.graph
      };
    }
  }, {
    key: 'resolve_range',
    value: function resolve_range(name, range) {
      if (!(name in this._tree)) {
        return;
      }

      var versions = Object.keys(this._tree[name]);
      var check = versions.every(function (version) {
        return semver.valid(version);
      });

      if (!check) {
        return;
      }

      return semver.maxSatisfying(range, Object.keys(versions));
    }
  }, {
    key: '_walk_down_facade',
    value: function _walk_down_facade(name, range, path, dependency_node) {
      // The offline ci could not know which facades to load,
      // so the range version of the facade is still not resolved.
      var version = this.resolve_range(name, range) || range;
      this._walk_down(name, range, version, path, dependency_node);
    }
  }, {
    key: '_walk_down_non_facade',
    value: function _walk_down_non_facade(name, range, version, dependency_node) {
      // If not facade, module should not contain `path`
      this._walk_down(name, range, version, '', dependency_node);
    }
  }, {
    key: '_get_pkg',
    value: function _get_pkg(name, version) {
      var parsed = parse_module_id(name);
      parsed.version = version;
      return parsed.pkg;
    }
  }, {
    key: '_walk_down',
    value: function _walk_down(name, range, version, path, dependency_node) {
      var _this2 = this;

      // if the node is already parsed,
      // sometimes we still need to add the dependency to the parent node
      var package_range_id = this._get_pkg(name, range);
      var package_id = this._get_pkg(name, version);

      var _get_graph_node2 = this._get_graph_node(package_id, version);

      var node = _get_graph_node2.node;
      var index = _get_graph_node2.index;


      dependency_node[package_range_id] = index;

      // Always select the module(not package),
      // because a package might have more than one modules
      this._select(name, version, path);

      if (~this.parsed.indexOf(package_id)) {
        // prevent parsing duplicately.
        return;
      }

      this.parsed.push(package_id);

      // Walk dependencies
      var dependencies = this._get_dependencies(name, version);
      if (!dependencies) {
        return;
      }

      var current_dependency_node = this._get_dependency_node(node);

      Object.keys(dependencies).forEach(function (dep) {
        var _parse_module_id = parse_module_id(dep);

        var name = _parse_module_id.name;
        var version = _parse_module_id.version;
        var path = _parse_module_id.path;

        // The dependency version of a package is already resolved by
        //   neuron-package-dependency

        var dep_version = dependencies[dep];
        _this2._walk_down_non_facade(name, version || '*', dep_version || '*', current_dependency_node);
      });
    }
  }, {
    key: '_get_dependencies',
    value: function _get_dependencies(name, version) {
      return access(this._tree, [name, version, 'dependencies']);
    }
  }, {
    key: '_select',
    value: function _select(name, version, path) {
      var selected = this.selected;
      if (!(name in selected)) {
        selected[name] = [];
      }

      path = path || '';

      var packages = selected[name];
      var exists = packages.some(function (pkg) {
        return version === pkg.version && path === pkg.path;
      });

      if (exists) {
        return;
      }

      packages.push({ version: version, path: path });
    }
  }, {
    key: '_get_graph_node',
    value: function _get_graph_node(package_id, version) {
      if (package_id in this.index_map) {
        var _index = this.index_map[package_id];
        var _node = this.graph[_index];
        return { node: _node, index: _index };
      }

      var index = this._guid();
      this.index_map[package_id] = index;

      var node = [version];
      this.graph[index] = node;
      return { node: node, index: index };
    }
  }, {
    key: '_get_dependency_node',
    value: function _get_dependency_node(node) {
      if (node.length === 1) {
        var dependency_node = {};
        node.push(dependency_node);
        return dependency_node;
      }

      return node[1];
    }
  }]);

  return Walker;
}();

module.exports = Walker;
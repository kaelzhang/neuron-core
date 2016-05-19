'use strict'

const parse_module_id = require('module-id')
const semver = require('semver')
const access = require('object-access')


class Walker {
  constructor (tree) {
    this._tree = tree || {}
    this.guid = 0
  }

  _guid () {
    return this.guid ++
  }

  look_up (facades) {
    this.parsed = []
    let facade_node = {}

    // `this.selected` has the structure like:
    // {
    //     '<name>': set([
    //         ('<version>', '<path>')
    //     ])
    // }
    this.selected = {}

    // see [here](https://github.com/kaelzhang/neuron/blob/master/doc/graph.md)
    this.graph = {
      _: facade_node
    }

    // map to store the index of the dependency node
    this.index_map = {}

    facades.forEach((id) => {
      let parsed = parse_module_id(id)
      // If the module id facaded contains path, the path will be ignored
      this._walk_down_facade(
        parsed.name,
        parsed.version || '*',
        parsed.path || '',
        facade_node
      )
    })

    return {
      packages: this.selected,
      graph: this.graph
    }
  }

  resolve_range (name, range) {
    if (!(name in this._tree)) {
      return
    }

    let versions = Object.keys(this._tree[name])
    let check = versions.every((version) => {
      return semver.valid(version)
    })

    if (!check) {
      return
    }

    return semver.maxSatisfying(range, Object.keys(versions))
  }

  _walk_down_facade (name, range, path, dependency_node) {
    // The offline ci could not know which facades to load,
    // so the range version of the facade is still not resolved.
    let version = this.resolve_range(name, range) || range
    this._walk_down(name, range, version, path, dependency_node)
  }

  _walk_down_non_facade (name, range, version, dependency_node) {
    // If not facade, module should not contain `path`
    this._walk_down(name, range, version, '', dependency_node)
  }

  _get_pkg (name, version) {
    let parsed = parse_module_id(name)
    parsed.version = version
    return parsed.pkg
  }

  _walk_down (name, range, version, path, dependency_node) {
    // if the node is already parsed,
    // sometimes we still need to add the dependency to the parent node
    let package_range_id = this._get_pkg(name, range)
    let package_id = this._get_pkg(name, version)

    let {
      node,
      index
    } = this._get_graph_node(package_id, version)

    dependency_node[package_range_id] = index

    // Always select the module(not package),
    // because a package might have more than one modules
    this._select(name, version, path)

    if (~this.parsed.indexOf(package_id)) {
      // prevent parsing duplicately.
      return
    }

    this.parsed.push(package_id)

    // Walk dependencies
    let dependencies = this._get_dependencies(name, version)
    if (!dependencies) {
      return
    }

    let current_dependency_node = this._get_dependency_node(node)

    Object.keys(dependencies).forEach((dep) => {
      let {
        name,
        version,
        path
      } = parse_module_id(dep)

      // The dependency version of a package is already resolved by
      //   neuron-package-dependency
      let dep_version = dependencies[dep]
      this._walk_down_non_facade(
        name,
        version || '*',
        dep_version || '*',
        current_dependency_node
      )
    })
  }

  _get_dependencies (name, version) {
    return access(this._tree, [name, version, 'dependencies'])
  }

  _select (name, version, path) {
    let selected = this.selected
    if (!(name in selected)) {
      selected[name] = []
    }

    path = path || ''

    let packages = selected[name]
    let exists = packages.some((pkg) => {
      return version === pkg.version
        && path === pkg.path
    })

    if (exists) {
      return
    }

    packages.push({version, path})
  }

  _get_graph_node (package_id, version) {
    if (package_id in this.index_map) {
      let index = this.index_map[package_id]
      let node = this.graph[index]
      return {node, index}
    }

    let index = this._guid()
    this.index_map[package_id] = index

    let node = [version]
    this.graph[index] = node
    return {node, index}
  }

  _get_dependency_node (node) {
    if (node.length === 1) {
      let dependency_node = {}
      node.push(dependency_node)
      return dependency_node
    }

    return node[1]
  }
}


module.exports = Walker

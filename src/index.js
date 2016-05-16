'use strict'

module.exports = neuron

const parse_module_id = require('module-id')
const Walker = require('./walker')


function neuron (options) {
  return new Neuron(options)
}


function NOOP () {}


const USER_CONFIGS = ['path', 'resolve']

class Neuron {
  constructor ({
    resolve,
    dependency_tree,
    js_config,
    debug

  }) {
    this._facades = []
    this._csses = []

    this._is_debug = typeof debug === 'function'
      ? debug
      : () => {
        return !!debug
      }

    this.resolve = typeof resolve === 'function'
      ? resolve
      : Neuron._default_resolver

    this.dependency_tree = dependency_tree
    this.js_config = js_config || {}

    this._loaded = []

    this._walker = new Walker(dependency_tree)
  }

  singleton () {
    let ret = {}

    ;[
      'facade',
      'css',
      'js',
      'src',
      'output_neuron',
      'output_css',
      'output_config',
      'output_scripts',
      'output_facades'

    ].forEach((method) => {
      ret[method] = (...args) => {
        return this[method](...args)
      }
    })

    return ret
  }

  _analyze () {
    this._analyze = NOOP

    let facade_module_ids = this._facades.map((facade) => {
      return facade.id
    })

    let {
      packages,
      graph
    } = this._walker.look_up(facade_module_ids)

    this._packages = packages
    this._graph = graph
    this._joiner = this._get_joiner()
  }

  facade (id, data) {
    this._facades.push({
      id: id,
      data: data
    })
    return ''
  }

  // @param {Boolean} inline, TODO
  js (js) {
    let src = this.src(js)
    return this._decorate(src, 'js')
  }

  // @param {Boolean} inline, TODO
  css (css) {
    this._csses.push(css)
    return ''
  }

  src (id) {
    let parsed = parse_module_id(id)
    return this._src(parsed)
  }

  _src (parsed) {
    let {
      name,
      version
    } = parsed

    version = this._walker.resolve_range(name, version)
    if (version) {
      parsed.version = version
    }

    return this.resolve(parsed.normalize_url())
  }

  output_neuron () {
    this._analyze()

    return this._decorate('/s/neuron.js', 'js')
  }

  output_css () {
    this._analyze()

    return this._csses
    .map((id) => {
      let href = this.src(id)
      return this._decorate(href, 'css')
    })
    .join(this._joiner)
  }

  // @param {String} link link resource
  // @param {String} type
  // @param {Boolean} inline whether should output resources inline
  _decorate (link, type, extra) {
    if (type === 'css') {
      return `<link rel="stylesheet" href="${link}">`
    }

    if (extra) {
      extra = ' ' + extra
    }

    if (type === 'js') {
      return `<script src="${link}"${extra}></script>`
    }
  }

  output_config () {
    this._analyze()

    let config = this._is_debug()
      ? {}
      : {
        loaded: this._json_stringify(this._loaded),
        graph: this._json_stringify(this._graph)
      }

    USER_CONFIGS.forEach((key) => {
      let c = this.js_config[key]
      if (c) {
        config[key] = c
      }
    })

    let joiner = ',' + this._get_joiner()

    let config_pair = Object.keys(config).map((key) => {
      return key + ':' + config[key]
    })
    .join(joiner)

    return `<script>neuron.config({${config_pair}})</script>`
  }

  output_scripts () {
    if (this._is_debug()) {
      return ''
    }

    this._analyze()

    let output = []

    Object.keys(this._packages).forEach((name) => {
      let {
        version,
        path
      } = this._packages[name]

      let id = parse_module_id(name, version, path)

      this._set_loaded(id)
      this._decorate_script(output, id)
    })

    return output.join(this._get_joiner())
  }

  _get_joiner () {
    return this._is_debug()
      ? '\n'
      : ''
  }

  _decorate_script (output, id) {
    let src = this._src(id)
    output.push(this._decorate(src, 'js', 'async'))
  }

  _set_loaded (id) {
    this._loaded.push(id.pkg)
  }

  output_facades () {
    this._analyze()

    let divider = this._is_debug()
      ? '\n'
      : ';'

    return [
      '<script>',

      this._facades
      .map((facade) => {
        if (!facade.data) {
          return `facade('${facade.id}')`
        }

        let data = this._json_stringify(facade.data)
        return `facade('${facade.id}', ${data})`
      })
      .join(),

      '</script>'

    ].join(this._joiner)
  }

  _json_stringify (subject) {
    return this._is_debug()
      ? JSON.stringify(subject, null, 2)
      : JSON.stringify(subject)
  }
}


Neuron._default_resolver = (pathname) => {
  return '/' + pathname
}

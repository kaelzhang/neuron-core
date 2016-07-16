'use strict'

module.exports = neuron

const parse_module_id = require('module-id')
const Walker = require('./walker')
const unique = require('make-unique')

const code = require('code-stringify')
code.QUOTE = '\''

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
    debug,
    enable_combo

  }) {
    this._facades = []
    this._csses = []

    this.enable_combo = enable_combo

    this._is_debug = debug
    this._joiner = this._get_joiner()

    this.resolve = typeof resolve === 'function'
      ? resolve
      : Neuron._default_resolver

    this.dependency_tree = dependency_tree
    this.js_config = js_config || {}

    this._loaded = []
    this._combos = []

    this._walker = new Walker(dependency_tree)
  }

  singleton () {
    let ret = {}

    ;[
      ['facade',         0],
      ['css',            0],
      ['analyze',        0],
      ['src',            0],
      ['combo',          0],
      ['js',             1],
      ['output_neuron',  1],
      ['output_css',     1],
      ['output_config',  1],
      ['output_scripts', 1],
      ['output_facades', 1]

    ].forEach(([method, output]) => {
      ret[method] = (...args) => {
        return this[method](...args) + (
          output
            ? this._joiner
            : ''
        )
      }
    })

    return ret
  }

  analyze () {
    this.analyze = NOOP

    let facade_module_ids = this._facades.map((facade) => {
      return facade.id
    })

    let {
      packages,
      graph
    } = this._walker.look_up(facade_module_ids)

    this._packages = packages
    this._graph = graph

    this._analyze_combo()

    return ''
  }

  combo (...names) {
    if (this.enable_combo && names.length) {
      this._combos.push(names)
    }

    return ''
  }

  _analyze_combo () {
    let combos = this._combos
    if (!combos.length) {
      return
    }

    this._combos = []
    combos.forEach((combo) => {
      combo = this._clean_combo(combo)
      if (combo.length) {
        this._combos.push(combo)
      }
    })
  }

  _clean_combo (combo) {
    let cleaned = []

    let select = (name, version, path) => {
      let id = parse_module_id(name)
      id.version = version
      id.path = path

      cleaned.push(id)
      this._set_loaded(id)
    }

    combo.forEach((name) => {
      let id = parse_module_id(name)

      if (!(id.name in this._packages)) {
        return
      }

      let {
        version,
        path
      } = id

      let version_paths = this._packages[name]

      if (version === undefined) {
        version_paths.forEach(({version, path}) => {
          select(name, version, path)
          delete this._packages[name]
        })
        return
      }

      let index = version_paths.findIndex((v) => {
        return v.version === version
          && v.path === path
      })

      if (!~index) {
        return
      }

      versions_path.splice(index, 1)
      select(name, version, path)

      if (!versions_path.length) {
        delete this._packages[name]
      }
    })

    return cleaned
  }

  facade (id, data) {
    this._facades.push({
      id: id,
      data: data
    })
    return this._joiner
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

    let {
      name,
      version
    } = parsed

    version = this._walker.resolve_range(name, version)
    if (version) {
      parsed.version = version
    }

    return this._src(parsed)
  }

  _src (parsed) {
    return this.resolve(parsed.url)
  }

  output_neuron () {
    return this._decorate(this.resolve('neuron.js'), 'js')
  }

  output_css () {
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

    extra = extra
      ? ' ' + extra
      : ''

    if (type === 'js') {
      return `<script src="${link}"${extra}></script>`
    }
  }

  output_config () {
    let config = {}

    USER_CONFIGS.forEach((key) => {
      let c = this.js_config[key]
      if (c) {
        config[key] = c
      }
    })

    if (!this._is_debug) {
      config.loaded = unique(this._loaded)
      config.graph = this._graph
    }

    let config_string = this._is_debug
      ? code(config, null, 2)
      : code(config)

    return `<script>neuron.config(${config_string})</script>`
  }

  output_scripts () {
    if (this._is_debug) {
      return this._joiner
    }

    let output = []
    this._output_combos_scripts(output)

    Object.keys(this._packages).forEach((name) => {
      this._packages[name].forEach((m) => {
        let {
          version,
          path
        } = m

        let id = parse_module_id(name)
        id.version = version
        id.path = path

        this._set_loaded(id)
        this._decorate_script(output, id)
      })
    })

    return output.join(this._joiner)
  }

  _output_combos_scripts (output) {
    this._combos.forEach((combo) => {
      if (combo.length === 1) {
        return this._decorate_script(output, combo[0])
      }

      let combo_urls = combo.map(id => id.url)
      let script = this._decorate(
        this.resolve(combo_urls),
        'js',
        'async'
      )

      output.push(script)
    })
  }

  _get_joiner () {
    return this._is_debug
      ? '\n'
      : ''
  }

  _decorate_script (output, id) {
    let src = this._src(id)
    output.push(this._decorate(src, 'js', 'async'))
  }

  _set_loaded (id) {
    this._loaded.push(id.id)
  }

  output_facades () {
    let divider = this._is_debug
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
    return this._is_debug
      ? JSON.stringify(subject, null, 2)
      : JSON.stringify(subject)
  }
}


Neuron._default_resolver = (pathname) => {
  return '/' + pathname
}

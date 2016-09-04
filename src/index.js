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
    this._jses = []
    this._loaded = []
    this._combos = []

    this.enable_combo = enable_combo

    this._is_debug = debug
    this._joiner = this._get_joiner()

    this.resolve = typeof resolve === 'function'
      ? resolve
      : Neuron._default_resolver

    this.dependency_tree = dependency_tree
    this.js_config = js_config || {}

    this._neuron_outputed = false

    this._walker = new Walker(dependency_tree)
  }

  toString () {
    return this._joiner
  }

  singleton () {
    let ret = {}

    //  method           chained
    ;[
      // public
      ['facade',         true],
      ['css',            true],
      ['combo',          true],
      ['js',             true],

      // semi-private
      ['analyze',        true],

      ['src',            false],
      // header
      ['output_css',     false],
      ['output_neuron',  false],
      ['output_scripts', false],

      // footer
      ['output_config',  false],
      ['output_facades', false]

    ].forEach(([method, chained]) => {
      ret[method] = (...args) => {
        let result = this[method](...args)

        return chained
          ? ret
          : result + this._joiner
      }
    })

    // For those who returns `this`
    ret.toString = () => {
      return ''
    }

    return ret
  }

  // css
  /////////////////////////////////////////////////////////////

  // Register a css resource or bunch of resources
  css (...ids) {
    this._csses.push(...ids)
  }

  // Should be used in mother template
  output_css () {
    return this._decorate_sources([], this._csses, 'css').join(this._joiner)
  }

  // facade & js
  /////////////////////////////////////////////////////////////

  // Register a facade with its data
  facade (id, data) {
    this._facades.push({
      id: id,
      data: data
    })
  }

  // Register a js file or a combo of js files

  // @param {string|Array.<string>}
  js (...ids) {
    // if neuron is not outputed, append to the first js
    if (!this._neuron_outputed) {
      this._neuron_outputed = true
      ids.push('neuron')
    }

    if (this.enable_combo) {
      this._jses.push(ids)
      return
    }

    ids.forEach((id) => {
      this._jses.push([id])
    })
  }

  // Declare that some modules should be comboed.
  combo (...names) {
    if (this.enable_combo && names.length) {
      this._combos.push(names)
    }
  }

  // output normal scripts which are mot modules
  _output_normal_scripts (output) {
    this._jses.forEach((jses) => {
      this._decorate_sources(output, jses, 'js')
    })
  }

  // Output a resolved url of a id or ids immediately.
  // @param {Array.<string|ModuleId>} ids
  src (...ids) {
    let urls = ids.map((id) => {
      if (id === 'neuron') {
        return 'neuron.js'
      }

      return typeof id === 'string'
        ? this._resolve_id(id).url
        : id.url
    })

    return this.resolve(...urls)
  }

  _resolve_id (id) {
    let parsed = parse_module_id(id)

    let {
      name,
      version
    } = parsed

    version = this._walker.resolve_range(name, version)
    if (version) {
      parsed.version = version
    }

    return parsed
  }

  // analyze
  /////////////////////////////////////////////////////////////

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

  // @param {string} combo
  // @returns {Array.<ModuleId>}
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
      name = id.name

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

  // decorator
  /////////////////////////////////////////////////////////////

  // Decorate one link
  // @param {String} link link resource
  // @param {String} type
  // @param {Boolean} inline whether should output resources inline
  _decorate (link, type, extra = '') {
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

  // Decorate by ids
  // @param {Array} output
  // @param {Array} ids
  // - if debug: output several sources
  // - otherwise: output the comboed source.
  _decorate_sources (output, ids, type, extra) {
    if (!ids.length) {
      return output
    }

    if (this._is_debug) {
      ids.forEach((id) => {
        this._decorate_by_ids(output, [id], type, extra)
      })

    } else {
      this._decorate_by_ids(output, ids, type, extra)
    }

    return output
  }

  _decorate_by_ids (output, ids, type, extra) {
    let src = this.src(...ids)
    output.push(this._decorate(src, type, extra))
  }

  output_neuron () {
    if (this._neuron_outputed) {
      return ''
    }

    this._neuron_outputed = true
    return this._decorate_sources([], ['neuron'], 'js')[0]
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
    let output = []

    this._output_normal_scripts(output)

    if (!this._is_debug) {
      this._output_combo_module_scripts(output)
      this._output_module_scripts(output)
    }

    return output.join(this._joiner)
  }

  _output_combo_module_scripts (output) {
    this._combos.forEach((combo) => {
      if (combo.length === 1) {
        return this._decorate_module_script(output, combo[0])
      }

      this._decorate_sources(output, combo, 'js', 'async')
    })
  }

  _output_module_scripts (output) {
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
        this._decorate_module_script(output, id)
      })
    })
  }

  _decorate_module_script (output, id) {
    this._decorate_sources(output, [id], 'js', 'async')
  }

  _get_joiner () {
    return this._is_debug
      ? '\n'
      : ''
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

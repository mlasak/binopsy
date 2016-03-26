module.exports = Bin

const Parser = require('binary-parser').Parser
const Serializer = require('./lib/serializer.js')

const PRIMITIVE_TYPES = require('./lib/primitive_types.json')
const PRIMITIVES = Object.keys(PRIMITIVE_TYPES).map(function(key){
  return key.toLowerCase()
})

const BITS = Array.apply(null, Array(24)).map(function(_, i){ return 'bit' + (i + 1) })

function Bin(){
  this.parser = new Parser
  this.serializer = new Serializer
}

Bin.start = function(){
  return new Bin
}

Bin.Parser = Bin //work as drop-in replacement

Bin.prototype.serialize = function(obj, buf){
  return this.serializer.serialize(obj, buf)
}

Bin.prototype.sizeOf = function(obj){
  if(obj == null) return this.parser.sizeOf()
  return this.serializer.sizeFunc(obj)
}

;['string', 'buffer', 'array', 'nest']
  .concat(PRIMITIVES)
  .concat(BITS)
  .forEach(function(name){
    Bin.prototype[name] = function(varName, options){
      if(options && options.type instanceof Bin){
        var parserOpts = {__proto__: options, type: options.type.parser}
      }

      this.parser[name](varName, parserOpts || options)
      this.serializer[name](varName, options)
      return this
    }
  })

Bin.prototype.choice = function(varName, options){
  var choices = options.choices
  var parserChoices = {}

  for(var key in choices){
    if(typeof choices[key] === "object"){
      parserChoices[key] = choices[key].parser
    } else {
      parserChoices[key] = choices[key]
    }
  }

  this.parser.choice(varName, {__proto__:options, choices: parserChoices})
  this.serializer.choice(varName, options)
  return this
}

Bin.prototype.create = function(constructorFn){
  this.parser.create(constructorFn)
  return this
}

;['getCode', 'compile', 'parse'].forEach(function(name){
  Bin.prototype[name] = function(buffer, callback){
    return this.parser[name](buffer, callback)
  }
})

Object.defineProperty(Bin.prototype, 'writeFunc', {
  get: function(){
    return this.serializer.writeFunc
  }
})

Object.defineProperty(Bin.prototype, 'sizeFunc', {
  get: function(){
    return this.serializer.sizeFunc
  }
})

Object.defineProperty(Bin.prototype, 'bitRequests', {
  get: function(){
    return this.serializer.bitRequests
  }
})

Bin.prototype.endianess = function(endianess) {
    this.parser.endianess(endianess)
    this.serializer.endianess(endianess)

    return this
}

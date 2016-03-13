module.exports = Serializer

//copied from binary_parser.js
const PRIMITIVE_TYPES = {
    'UInt8'    : 1,
    'UInt16LE' : 2,
    'UInt16BE' : 2,
    'UInt32LE' : 4,
    'UInt32BE' : 4,
    'Int8'     : 1,
    'Int16LE'  : 2,
    'Int16BE'  : 2,
    'Int32LE'  : 4,
    'Int32BE'  : 4,
    'FloatLE'  : 4,
    'FloatBE'  : 4,
    'DoubleLE' : 8,
    'DoubleBE' : 8
}

const TYPE_FUNCTIONS = Object.keys(PRIMITIVE_TYPES).reduce(function(obj, key){
  var writeKey = 'write' + key
  obj[key.toLowerCase()] = {
    sizeOf: function(){
      return PRIMITIVE_TYPES[key]
    },
    writeFunc: function(val, buf){
      return buf[writeKey](val)
    }
  }
  return obj
}, {})

function getType(type){
  if(typeof type === "string" && type in TYPE_FUNCTIONS){
    return TYPE_FUNCTIONS[type]
  } else if(!(type instanceof Serializer)){
    throw new Error("type needs to be a serializer or a primitive")
  }

  return type
}

function getGetVarFunc(varName){
  return function(obj){
    if(!(varName in obj)) throw new Error('var not found')
    return obj[varName]
  }
}

function Serializer(){
  this.sizeOf = function(obj){ return 0 }
  this.writeFunc = function(obj, buf){ return 0 }
  this.vars = new Set()
}

Serializer.prototype.serialize = function(obj, buf){
  if(!Buffer.isBuffer(buf)){
    var size = this.sizeOf(obj)
    buf = new Buffer(size)
  }

  this.writeFunc(obj, buf, 0)

  return buf
}

Serializer.prototype.string = function(varName, options){
  var getVar = this._getVarFunc(varName, options)

  var sizeOf = this.sizeOf
  var writeFunc = this.writeFunc

  //FIXME only utf8/1-byte-per-char currently works reliably
  var encoding = options.encoding || 'utf8'

  if(options.length){
    var length = options.length

    var getLength = typeof options.length === 'number' ?
                      function(obj){ return length } :
                    typeof options.length === 'string' ?
                      function(obj){ return obj[length] } :
                      function(obj){ return length(obj) } //assume it's a function

    this.sizeOf = options.zeroTerminated ?
                    function(obj){
                      return Math.min(getLength(obj), Buffer.byteLength(getVar(obj), encoding) + 1) + sizeOf(obj)
                    } :
                    function(obj){
                      return getLength(obj) + sizeOf(obj)
                    }

    var addZeros =
            options.zeroTerminated ?
              function(written, len){
                return written < len ? 1 : 0
              } :
            options.stripNull ?
              function stripNull(written, len){
                return len - written
              } : function(val, len){
                return 0
              }

    this.writeFunc = function(obj, buf){
      var offset = writeFunc(obj, buf)
      var len = getLength(obj)
      var written = buf.write(getVar(obj), offset, len, encoding)
      var toAdd = addZeros(written, len)

      for(var i = 0; i < toAdd; i++){
        buf[offset + written + i] = 0
      }

      return offset + written + toAdd
    }

    return this
  }

  if(options.zeroTerminated){
    this.sizeOf = function(obj){
      return Buffer.byteLength(getVar(obj), encoding) + 1 + sizeOf(obj)
    }

    this.writeFunc = function(obj, buf){
      var offset = writeFunc(obj, buf)
      var val = getVar(obj)

      return offset + buf.write(val + '\0', offset, val.length + 1, encoding)
    }

    return this
  }

  throw new Error('.string() needs either a length or a zero-terminated string')
}

Serializer.prototype.nest = function(varName, options){
  var getVar = this._getVarFunc(varName, options)

  var sizeOf = this.sizeOf
  var writeFunc = this.writeFunc

  var type = getType(options.type)

  var typeSize = type.sizeOf
  var typeWrite = type.writeFunc

  this.sizeOf = function(obj){
    return typeSize(getVar(obj)) + sizeOf(obj)
  }

  this.writeFunc = function(obj, buf){
    var offset = writeFunc(obj, buf)
    return offset + typeWrite(getVar(obj), buf.slice(offset))
  }

  return this
}

Serializer.prototype.array = function(varName, options){
  //TODO check if passed array has acceptable length
  var getVar = this._getVarFunc(varName, options)

  if(typeof options.key === "string"){
    var plainVar = getVar
    getVar = function(obj){
      var val = plainVar(obj)
      return Object.keys(val).map(function(key){
        if(val[key][options.key] !== key) throw new Error('invalid mapping')
        return val[key]
      })
    }
  }

  var sizeOf = this.sizeOf
  var writeFunc = this.writeFunc

  var type = getType(options.type)

  var typeSize = type.sizeOf
  var typeWrite = type.writeFunc

  this.sizeOf = function(obj){
    var arr = getVar(obj)
    var sum = 0
    for(var i = 0; i < arr.length; i++){
      sum += typeSize(arr[i])
    }
    return sum + sizeOf(obj)
  }

  this.writeFunc = function(obj, buf){
    var offset = writeFunc(obj, buf)
    var arr = getVar(obj)
    for(var i = 0; i < arr.length; i++){
      offset += typeWrite(arr[i], buf.slice(offset))
    }
    return offset
  }

  return this
}

Serializer.prototype.choice = function(varName, options){
  var getVar = this._getVarFunc(varName, options)

  var sizeOf = this.sizeOf
  var writeFunc = this.writeFunc

  var getTag = getGetVarFunc(options.tag)

  var choices = options.choices
  var choiceTypes = {}

  for(var key in choices){
    choiceTypes[key] = getType(choices[key])
  }

  var defaultChoice = options.defaultChoice && getType(options.defaultChoice)

  var getChoice = options.defaultChoice ?
                  function(obj){
                    var key = getTag(obj)
                    return key in choiceTypes ? choiceTypes[key] : defaultChoice
                  } :
                  function(obj){
                    var choice = choiceTypes[getTag(obj)]
                    if(!choice) throw new Error('invalid choice')
                    return choice
                  }

  this.sizeOf = function(obj){
    return getChoice(obj).sizeOf(getVar(obj)) + sizeOf(obj)
  }

  this.writeFunc = function(obj, buf){
    var offset = writeFunc(obj, buf)
    return offset + getChoice(obj).writeFunc(getVar(obj), buf.slice(offset))
  }

  return this
}

Serializer.prototype.buffer = function(varName, options){
  //TODO check for length
  var getVar = this._getVarFunc(varName, options)

  var sizeOf = this.sizeOf
  var writeFunc = this.writeFunc

  this.sizeOf = function(obj){
    return getVar(obj).length + sizeOf(obj)
  }

  this.writeFunc = function(obj, buf){
    var offset = writeFunc(obj, buf)
    return offset + getVar(obj).copy(buf, offset)
  }

  return this
}

Object.keys(PRIMITIVE_TYPES).forEach(function(primitiveName){
  var writeKey = 'write' + primitiveName
  var primitiveSize = PRIMITIVE_TYPES[primitiveName]

  Serializer.prototype[primitiveName.toLowerCase()] = function(varName, options){
    var getVar = this._getVarFunc(varName, options)

    //add the size of the primitive
    var sizeOf = this.sizeOf
    this.sizeOf = function(obj){
      return primitiveSize + sizeOf(obj)
    }

    var writeFunc = this.writeFunc
    this.writeFunc = function(obj, buf){
      var offset = writeFunc(obj, buf)
      return buf[writeKey](getVar(obj), offset)
    }

    return this
  }
})

Serializer.prototype._getVarFunc = function(varName, options) {
  //to ensure getting a value is the same while reading & serializing
  if(this.vars.has(varName)) throw new Error('duplicated var name')
  this.vars.add(varName)

  if(options && options.formatter && !options.deformatter){
    throw new Error('formats need to be reversible')
  }

  if(options && options.deformatter){
    var deformatter = options.deformatter
    return function(obj){
      if(!(varName in obj)) throw new Error('var not found')
      return deformatter(obj[varName])
    }
  }

  return getGetVarFunc(varName)
}

module.exports = Serializer

const PRIMITIVE_TYPES = require('./primitive_types.json')
const getType = require('./type_functions.js')

function getGetVarFunc(varName){
  return function(obj){
    if(!(varName in obj)) throw new Error('var `' + varName + '` not found')
    return obj[varName]
  }
}

function Serializer(){
  this.sizeFunc = function(obj){ return 0 }
  this.writeFunc = function(obj, buf){ return 0 }
  this.vars = new Set()
}

Serializer.prototype.serialize = function(obj, buf){
  if(!Buffer.isBuffer(buf)){
    var size = this.sizeFunc(obj)
    buf = new Buffer(size)
  }

  this.writeFunc(obj, buf)

  return buf
}

Serializer.prototype.string = function(varName, options){
  var getVar = this._getVarFunc(varName, options)

  var sizeFunc = this.sizeFunc
  var writeFunc = this.writeFunc

  var encoding = options.encoding || 'utf8'

  if(options.length){
    var length = options.length

    var getLength = typeof length === 'number' ?
                      function(obj){ return length } :
                    typeof length === 'string' ?
                      function(obj){ return obj[length] } :
                      function(obj){ return length.call(obj) } //assume it's a function

    this.sizeFunc = options.zeroTerminated ?
                    function(obj){
                      return Math.min(getLength(obj), Buffer.byteLength(getVar(obj), encoding) + 1) + sizeFunc(obj)
                    } :
                    function(obj){
                      return getLength(obj) + sizeFunc(obj)
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
    this.sizeFunc = function(obj){
      return Buffer.byteLength(getVar(obj), encoding) + 1 + sizeFunc(obj)
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

  var sizeFunc = this.sizeFunc
  var writeFunc = this.writeFunc

  var type = getType(options.type)

  var typeSize = type.sizeFunc
  var typeWrite = type.writeFunc

  this.sizeFunc = function(obj){
    return typeSize(getVar(obj)) + sizeFunc(obj)
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

  var sizeFunc = this.sizeFunc
  var writeFunc = this.writeFunc

  var type = getType(options.type)

  var typeSize = type.sizeFunc
  var typeWrite = type.writeFunc

  this.sizeFunc = function(obj){
    var arr = getVar(obj)
    var sum = 0
    for(var i = 0; i < arr.length; i++){
      sum += typeSize(arr[i])
    }
    return sum + sizeFunc(obj)
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

  var sizeFunc = this.sizeFunc
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

  this.sizeFunc = function(obj){
    return getChoice(obj).sizeFunc(getVar(obj)) + sizeFunc(obj)
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

  var sizeFunc = this.sizeFunc
  var writeFunc = this.writeFunc

  this.sizeFunc = function(obj){
    return getVar(obj).length + sizeFunc(obj)
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
    var sizeFunc = this.sizeFunc
    this.sizeFunc = function(obj){
      return primitiveSize + sizeFunc(obj)
    }

    var writeFunc = this.writeFunc
    this.writeFunc = function(obj, buf){
      var offset = writeFunc(obj, buf)
      return buf[writeKey](getVar(obj), offset)
    }

    return this
  }
})

Serializer.prototype._processBitfield = function(reqs){
  var that = this

  var beforePrepareFunc = this.writeFunc
  this.writeFunc = function prepare(obj, buf){
    var offset = beforePrepareFunc(obj, buf)
    buf[offset] = 0
    return offset
  }

  //write writeFunc as a side effect
  var length = reqs.reduce(function(sum, req){
    var writeFunc = that.writeFunc

    var i = req.i
    var innerByteOffset = sum % 8
    var getVar = req.vars.map(getGetVarFunc).reduce(function(p, n){
      return function(obj){
        return n(p(obj))
      }
    })

    that.writeFunc = function(obj, buf){
      var offset = writeFunc(obj, buf)
      var val = getVar(obj)
      var bitsWrittenInByte = innerByteOffset
      var remainingBitsToWrite = i

      while(remainingBitsToWrite > 0){

        //only consider first `shiftAmount` writable bits
        //if `shiftAmount` is negative, there are bits left over
        var shiftAmount = bitsWrittenInByte + remainingBitsToWrite - 8
        buf[offset] |= shiftAmount < 0 ? val << -shiftAmount : val >> shiftAmount

        remainingBitsToWrite -= 8 - bitsWrittenInByte

        if(remainingBitsToWrite >= 0){
          val &= (1 << remainingBitsToWrite) - 1
          offset += 1
          buf[offset] = 0
          bitsWrittenInByte = 0
        }
      }

      return offset
    }

    return sum + i
  }, 0, this)

  if(length % 8){
    //if there is an incomplete byte, ensure we continue at next byte
    var beforeCompleteFunc = this.writeFunc
    this.writeFunc = function complete(obj, buf){
      return 1 + beforeCompleteFunc(obj, buf)
    }
  }

  var sizeFunc = this.sizeFunc
  var bytes = Math.ceil(length / 8)

  this.sizeFunc = function(obj){
    return bytes + sizeFunc(obj)
  }
}

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
      if(!(varName in obj)) throw new Error('var `' + varName + '` not found')
      return deformatter(obj[varName])
    }
  }

  return getGetVarFunc(varName)
}

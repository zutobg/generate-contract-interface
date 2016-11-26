const SolidityParser = require('solidity-parser')

// since the parser currently parser modifiers into the same heap as constant, public, private, etc, we need to whitelist these
const notModifiers = {
  'constant': 1,
  'payable': 1,
  'public': 1,
  'private': 1,   // redundant: private functions get filtered out before modifiers are filtered
  'internal': 1,  // redundant: internal functions get filtered out before modifiers are filtered
  'returns': 1
}

/** Returns true if the given ast statement is a function. */
function isFunction(statement) {
  return statement.type === 'FunctionDeclaration'
}

/** Returns true if the given function ast is public. */
function isPublic(f) {
  return !f.modifiers || f.modifiers.every(mod => mod.name !== 'private' && mod.name !== 'internal')
}

/** Returns true if the given function ast is the fallback function. */
function isFallbackFunction(f) {
  return !f.name
}

/** Returns a function that returns true if the given object has a specific property value. */
function propEquals(prop, value) {
  return o => o[prop] === value
}

/** Inverts a boolean function. */
function not(f) {
  return (...args) => !f(...args)
}

/** Returns a function that calls any number of functions on the arguments and ANDs the results. */
function and(...fs) {
  return fs.reduce(and2)
}

/** Returns a function that calls two functions on the arguments and ANDs the results. */
function and2(f, g) {
  return (...args) => f(...args) && g(...args)
}

module.exports = (src, options = {}) => {

  // parse contract
  const ast = SolidityParser.parse(src)

  // get pragma statement
  const pragma = ast.body.find(statement => statement.type === 'PragmaStatement')
  const pragmaSrc = pragma ? src.slice(pragma.start, pragma.end) + '\n' : ''

  // get contract name
  const contract = ast.body.find(statement => statement.type === 'ContractStatement')

  const functions = contract.body
    .filter(and(
      isFunction,
      isPublic,
      not(propEquals('name', contract.name)),
      not(isFallbackFunction)
    ))
    // filter out actual modifiers
    .map(f => {
      f.notModifiers = f.modifiers ? f.modifiers.filter(mod => mod.name in notModifiers) : []
      return f
    })

  const stubs = functions
    .map(f => {
      const nameAndParams = f.params ?
        src.slice(f.start, f.params[f.params.length-1].end + 1) :
        `function ${f.name}()`
      const notModifiers = f.notModifiers.length ?
        ' ' + f.notModifiers.map(notMod => src.slice(notMod.start, notMod.end).trim()).join(' ') :
        ''
      return `  ${nameAndParams}${notModifiers};`
    })
    .join('\n')

  return `${pragmaSrc}
contract I${contract.name} {
${stubs}
}`
}

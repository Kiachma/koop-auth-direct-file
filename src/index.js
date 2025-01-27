const fs = require('fs')
const jwt = require('jsonwebtoken')
const validateCredentials = require('./validate-credentials')
const TOKEN_EXPIRATION_MINUTES = 60
let _useHttp
let _tokenExpirationMinutes
let _secret
let _userStoreFilePath

/**
 * configure auth functions
 * @param {string}   secret - secret for generating tokens
 * @param {string}   userStoreFilePath - file path of user store JSON file
 * @param {object}   options
 * @param {integer}  options.tokenExpirationMinutes - number of minutes until token expires
 * @param {boolean}  options.useHttp - direct consumers of authenticationSpecifcation to use HTTP instead of HTTPS
 */
function auth (secret, userStoreFilePath, options = {}) {
  // Throw error if user-store file does not exist
  fs.stat(userStoreFilePath, function (err, stats) {
    if (err) throw err
  })

  _secret = secret
  _userStoreFilePath = userStoreFilePath

  // Ensure the useHttp option is a boolean and default to false
  if (options.useHttp && typeof options.useHttp !== 'boolean') throw new Error(`"useHttp" must be a boolean`)
  _useHttp = options.useHttp || false

  //  Ensure token expiration is an integer greater than 5
  if (options.tokenExpirationMinutes && (!Number.isInteger(options.tokenExpirationMinutes) || options.tokenExpirationMinutes < 5)) throw new Error(`"tokenExpirationMinutes" must be an integer >= 5`)

  _tokenExpirationMinutes = options.tokenExpirationMinutes || TOKEN_EXPIRATION_MINUTES

  return {
    type: 'auth',
    authenticationSpecification,
    authenticate,
    authorize
  }
}

/**
 * Return "authenticationSpecification" object for use in output-services
 * @returns {object}
 */
function authenticationSpecification () {
  return {
    useHttp: _useHttp
  }
}

/**
 * Authenticate a user's submitted credentials
 * @param {object} req Express request object
 * @returns {Promise}
 */
function authenticate (req) {
  return new Promise((resolve, reject) => {
    let username
    let password
    if (req && req.query && req.query.username) username = req.query.username
    if (req && req.query && req.query.password) password = req.query.password
    
    if(!username && req.body.username) username = req.body.username
    if(!password && req.body.password) password = req.body.password
    // Validate user's credentials
    validateCredentials(username, password, _userStoreFilePath)
      .then(valid => {
        // If credentials were not valid, reject
        if (!valid) {
          let err = new Error('Invalid credentials.')
          err.code = 401
          reject(err)
        }
        // Create access token and wrap in response object
        let expires = Date.now() + (_tokenExpirationMinutes * 60 * 1000)
        let json = {
          token: jwt.sign({exp: Math.floor(expires / 1000), sub: username}, _secret),
          expires
        }
        resolve(json)
      })
      .catch(err => {
        reject(err)
      })
  })
}

/**
 * Validate a token
 * @param {object} req Express request object
 * @returns {Promise}
 */
function authorize (req) {
  return new Promise((resolve, reject) => {
    // Make sure there is token
    let token
    if (req && req.query && req.query.token) token = req.query.token
    if (req && req.headers && req.headers.authorization) token = req.headers['authorization']
    if (!token) {
      let err = new Error('No authorization token.')
      err.code = 401
      reject(err)
    }
    // Verify token with async decoded function
    jwt.verify(token, _secret, function (err, decoded) {
      // If token invalid, reject
      if (err) {
        err.code = 401
        reject(err)
      }
      // Resolve the decoded token (an object)
      resolve(decoded)
    })
  })
}

module.exports = auth

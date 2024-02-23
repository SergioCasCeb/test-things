const { parseArgs } = require('node:util')
const coap = require('coap')
const fs = require('fs')
const path = require('path')
const { JsonPlaceholderReplacer } = require('json-placeholder-replacer')
const cbor = require('cbor')
require('dotenv').config()

const server = coap.createServer()
const hostname = 'localhost'
let portNumber = 5684
const thingName = 'coap-calculator-content-negotiation'

const { values: { port } } = parseArgs({
  options: {
    port: {
      type: 'string',
      short: 'p'
    }
  }
})

if (port && !isNaN(parseInt(port))) {
  portNumber = parseInt(port)
}

const tmPath = process.env.TM_PATH

if (process.platform === 'win32') {
  tmPath.split(path.sep).join(path.win32.sep)
}

const thingModel = JSON.parse(fs.readFileSync(path.join(__dirname, tmPath)))

const placeholderReplacer = new JsonPlaceholderReplacer()
placeholderReplacer.addVariableMap({
  PROTOCOL: 'coap',
  THING_NAME: thingName,
  HOSTNAME: hostname,
  PORT_NUMBER: portNumber,
  RESULT_OBSERVABLE: true,
  LAST_CHANGE_OBSERVABLE: true
})

/*****************************************/
/************ Creating the TD ************/
/*****************************************/

const thingDescription = placeholderReplacer.replace(thingModel)
thingDescription['@type'] = 'Thing'

const supportedContentTypes = ['application/json', 'application/cbor'];
const formatIdentifiers = {
  'application/json': 50,
  'application/cbor': 60
}

const defaultForm = {
  'href': '',
  'contentType': 'application/json',
  'cov:contentFormat': 50,
  'op': '',
  'cov:method': '',
  'cov:accept': 50,
  'response': {
    'contentType': 'application/json',
    'cov:contentFormat': 50
  }
}

//Adding headers to the Properties
for (const key in thingDescription['properties']) {

  thingDescription['properties'][key]['forms'] = []

  const newFormRead = JSON.parse(JSON.stringify(defaultForm))
  newFormRead['href'] = `properties/${key}`
  newFormRead['cov:method'] = 'GET'
  newFormRead['op'] = 'readproperty'

  const newFormObs = JSON.parse(JSON.stringify(newFormRead))
  newFormObs['op'] = ['observeproperty', 'unobserveproperty']
  newFormObs['subprotocol'] = 'cov:observe'

  thingDescription['properties'][key]['forms'].push(newFormRead)
  thingDescription['properties'][key]['forms'].push(newFormObs)

  const originalForm = thingDescription['properties'][key]['forms'][0]

  for (const identifier in formatIdentifiers) {
    if (originalForm['contentType'] !== identifier) {
      const newFormRead = JSON.parse(JSON.stringify(originalForm))
      newFormRead['contentType'] = identifier
      newFormRead['cov:contentFormat'] = formatIdentifiers[identifier]
      newFormRead['cov:accept'] = formatIdentifiers[identifier]
      newFormRead['response']['contentType'] = identifier
      newFormRead['response']['cov:contentFormat'] = formatIdentifiers[identifier]
      thingDescription['properties'][key]['forms'].push(newFormRead)

      const newFormObs = JSON.parse(JSON.stringify(newFormRead))
      newFormObs['op'] = ['observeproperty', 'unobserveproperty']
      newFormObs['subprotocol'] = 'cov:observe'
      thingDescription['properties'][key]['forms'].push(newFormObs)
    }
  }
}

//Adding headers to the Actions
for (const key in thingDescription['actions']) {

  thingDescription['actions'][key]['forms'] = []

  const newForm = JSON.parse(JSON.stringify(defaultForm))
  newForm['href'] = `actions/${key}`
  newForm['cov:method'] = 'POST'
  newForm['op'] = 'invokeaction'

  thingDescription['actions'][key]['forms'].push(newForm)

  const originalForm = thingDescription['actions'][key]['forms'][0]

  for (const identifier in formatIdentifiers) {
    /**
     * Checking if the original form does not have the formats from the 'formatIdentifiers' object and 
     * duplicating the original form with the new formats.
     * If it does have it, duplicate the original one, but modify the response and accept header to include
     * the other headers.
     */
    if (originalForm['contentType'] !== identifier) {
      const newForm = JSON.parse(JSON.stringify(originalForm))
      newForm['contentType'] = identifier
      newForm['cov:contentFormat'] = formatIdentifiers[identifier]
      newForm['cov:accept'] = formatIdentifiers[identifier]
      newForm['response']['contentType'] = identifier
      newForm['response']['cov:contentFormat'] = formatIdentifiers[identifier]
      thingDescription['actions'][key]['forms'].push(newForm)

      /**
       * Cloning the forms with the new format, but modifying the accept and response headers 
       * to include the different formats
       */
      for (const identifier in formatIdentifiers) {
        if (newForm['cov:accept'] !== formatIdentifiers[identifier]) {
          const newFormAccept = JSON.parse(JSON.stringify(newForm))
          newFormAccept['cov:accept'] = formatIdentifiers[identifier]
          newFormAccept['response']['contentType'] = identifier
          newFormAccept['response']['cov:contentFormat'] = formatIdentifiers[identifier]
          thingDescription['actions'][key]['forms'].push(newFormAccept)
        }
      }
    } else {
      for (const identifier in formatIdentifiers) {
        if (originalForm['cov:accept'] !== formatIdentifiers[identifier]) {
          const newForm = JSON.parse(JSON.stringify(originalForm))
          newForm['cov:accept'] = formatIdentifiers[identifier]
          newForm['response']['contentType'] = identifier
          newForm['response']['cov:contentFormat'] = formatIdentifiers[identifier]
          thingDescription['actions'][key]['forms'].push(newForm)
        }
      }
    }
  }
}


//Adding headers to the Events
for (const key in thingDescription['events']) {

  thingDescription['events'][key]['forms'] = []

  const newForm = JSON.parse(JSON.stringify(defaultForm))
  newForm['href'] = `events/${key}`
  newForm['cov:method'] = 'GET'
  newForm['op'] = ["subscribeevent", "unsubscribeevent"]
  newForm['subprotocol'] = 'cov:observe'

  thingDescription['events'][key]['forms'].push(newForm)

  const originalForm = thingDescription['events'][key]['forms'][0]

  for (const identifier in formatIdentifiers) {
    if (originalForm['contentType'] !== identifier) {
      const newForm = JSON.parse(JSON.stringify(originalForm))
      newForm['contentType'] = identifier
      newForm['cov:contentFormat'] = formatIdentifiers[identifier]
      newForm['cov:accept'] = formatIdentifiers[identifier]
      newForm['response']['contentType'] = identifier
      newForm['response']['cov:contentFormat'] = formatIdentifiers[identifier]
      thingDescription['events'][key]['forms'].push(newForm)
    }
  }
}

//Creating the TD for testing purposes
try {
  fs.writeFileSync('coap-content-negotiation-calculator-thing.td.jsonld', JSON.stringify(thingDescription, null, 2))
} catch (err) {
  console.log(err);
}

/*********************************************************/
/************** Main server functionality ****************/
/*********************************************************/
let result = 0
let lastChange = ''

server.on('request', (req, res) => {
  const segments = req.url.split('/')
  const acceptHeaders = req.headers['Accept']
  const reqContentType = req.headers['Content-Type'] || req.headers['Content-Format']

  console.log(segments);
  // console.log("Accept:", acceptHeaders);
  // console.log("content type:", reqContentType);


  if (segments[1] !== thingName) {
    res.code = 404
    res.end()
  } else {
    if (!segments[2]) {
      if (req.method === 'GET') {
        res.end(JSON.stringify(thingDescription))
      }
      else {
        res.code = 405
        res.end()
      }
    }
  }

  if (segments[2] === 'properties') {
    if (req.method === 'GET') {
      if (supportedContentTypes.includes(acceptHeaders)) {

        //Set the content-format header to the accepted header
        res.setOption('Content-Format', acceptHeaders)

        //Result Endpoint
        if (segments[3] === 'result') {

          //Start the observation of the property if observe attribute is set to true
          if (req.headers.Observe === 0) {
            console.log('Observing result property...')

            let oldResult = result

            //Todo: observation functionality should not happen inside a loop
            const changeInterval = setInterval(() => {

              if (oldResult !== result) {
                console.log("entered result change");
                res.statusCode = 205
                if (acceptHeaders.includes('application/json')) {
                  res.write(JSON.stringify(result))
                  oldResult = result
                }
                else {
                  const cborData = cbor.encode(result)
                  res.write(cborData)
                  oldResult = result
                }
              }
            }, 1000)

            res.on('finish', () => {
              clearInterval(changeInterval)
            })

          }
          else {

            //If no observation is required, send only the result and close connection
            if (acceptHeaders.includes('application/json')) {
              res.end(JSON.stringify(result))
            }
            else {
              const cborData = cbor.encode(result)
              res.end(cborData)
            }

          }
        }
        //Last Change Endpoint
        else if (segments[3] === 'lastChange') {

          //Start the observation of the property if observe attribute is set to true
          if (req.headers.Observe === 0) {
            console.log('Observing lastChange property...')

            let oldDate = lastChange

            const changeInterval = setInterval(() => {

              if (oldDate !== lastChange) {
                console.log("Entering lastChange");
                res.statusCode = 205
                if (acceptHeaders.includes('application/json')) {
                  res.write(JSON.stringify(lastChange))
                  oldDate = lastChange
                }
                else {
                  const cborData = cbor.encode(lastChange)
                  res.write(cborData)
                  oldDate = lastChange
                }
              }
            }, 1000)

            res.on('finish', () => {
              clearInterval(changeInterval)
            })

          }
          else {

            //If no observation is required, send only the result and close connection
            if (acceptHeaders.includes('application/json')) {
              res.end(JSON.stringify(lastChange))
            }
            else {
              const cborData = cbor.encode(lastChange)
              res.end(cborData)
            }

          }
        }
        else {
          res.code = 404
          res.end()
        }

      }
      else {
        res.statusCode = 406
        res.end()
      }
    }
    else {
      res.code = 405
      res.end()
    }
  }

  if (segments[2] === 'actions') {
    if (req.method === 'POST') {
      if (supportedContentTypes.includes(reqContentType)) {
        if (supportedContentTypes.includes(acceptHeaders)) {

          //Set the content-format header to the accepted header
          res.setOption('Content-Format', acceptHeaders)

          //Addition endpoint
          if (segments[3] === 'add') {
            let numberToAdd

            if (reqContentType.includes('application/json')) {
              numberToAdd = JSON.parse(req.payload.toString())
            }
            else {
              numberToAdd = cbor.decode(req.payload);   
            }

            if (typeof numberToAdd !== "number" || !numberToAdd) {
              res.code = 400
              res.end()
            }
            else {
              result += numberToAdd
              lastChange = new Date()

              if (acceptHeaders.includes('application/json')) {
                res.end(JSON.stringify(result))
              }
              else {
                const cborData = cbor.encode(result)
                res.end(cborData)
              }
            }
          }
          //Subtraction endpoint
          else if (segments[3] === 'subtract') {

            let numberToSubtract

            if (reqContentType.includes('application/json')) {
              numberToSubtract = JSON.parse(req.payload.toString())
            }
            else {
              numberToSubtract = cbor.decode(req.payload);  
            }

            if (typeof numberToSubtract !== "number" || !numberToSubtract) {
              res.code = 400
              res.end()
            }
            else {
              result -= numberToSubtract
              lastChange = new Date()

              if (acceptHeaders.includes('application/json')) {
                res.end(JSON.stringify(result))
              }
              else {
                const cborData = cbor.encode(result)
                res.end(cborData)
              }
            }
          }
          else {
            res.code = 404
            res.end()
          }
        }
        else {
          res.code = 406
          res.end()
        }
      }
      else {
        res.code = 415
        res.end()
      }
    }
    else {
      res.code = 405
      res.end()
    }
  }

  if (segments[2] === 'events' && req.method === 'GET') {
    if (segments[3] === 'update') {
      if (req.headers.Observe === 0) {
        if (supportedContentTypes.includes(acceptHeaders)) {
          console.log('Observing update event...')

          let oldResult = result

          const changeInterval = setInterval(() => {
            //Set the content-format header to the accepted header
            res.setOption('Content-Format', acceptHeaders)

            if (oldResult !== result) {
              console.log("entered update change");
              res.statusCode = 205
              if (acceptHeaders.includes('application/json')) {
                res.write(JSON.stringify(result))
                oldResult = result
              }
              else {
                const cborData = cbor.encode(result)
                res.write(cborData)
                oldResult = result
              }
            }
          }, 1000)

          res.on('finish', () => {
            clearInterval(changeInterval)
          })
        }
        else {
          res.statusCode = 406
          res.end()
        }
      }
      else {
        res.code = 402
        res.end()
      }
    }
    else {
      res.code = 404
      res.end()
    }
  }
})

server.listen(portNumber, () => {
  console.log(`Started listening to localhost on port ${portNumber}...`)
  console.log('ThingIsReady')
})
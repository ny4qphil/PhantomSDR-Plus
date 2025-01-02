import isNumber from 'is-number'
import qs from 'qs'

export function constructLink (parameters) {
  const link = qs.stringify(parameters)
  return link
}

export function parseLink (queryString) {
  const parameters = qs.parse(queryString)
  return sanitizeParameters(parameters)
}

export function storeInLocalStorage (parameters) {
  Object.entries(parameters).forEach(([k, v]) => {
    localStorage.setItem(k, v)
  })
}

export function loadFromLocalStorage () {
  return sanitizeParameters(localStorage)
}

export function sanitizeParameters (parameters) {
  const sanitized = {}
  if ('frequency' in parameters && isNumber(parameters.frequency)) {
    sanitized.frequency = parseFloat(parameters.frequency)
  }
  if ('modulation' in parameters) {
    sanitized.modulation = parameters.modulation.toUpperCase()
  }
  return sanitized
}

import Hammer from '@egjs/hammerjs'

export function pinch (node) {
  const hammer = new Hammer.Manager(node)

  const pinch = new Hammer.Pinch()

  hammer.add(pinch)
  hammer.on('pinchmove', function (e) {
    node.dispatchEvent(new CustomEvent('pinchmove', { detail: e }))
  })
  hammer.on('pinchstart', function (e) {
    node.dispatchEvent(new CustomEvent('pinchstart', { detail: e }))
  })

  return {
    destroy () {

    }
  }
}

export function pan (node) {
  const hammer = new Hammer.Manager(node)

  const pan = new Hammer.Pan()

  hammer.add(pan)

  hammer.on('panstart', function (e) {
    node.dispatchEvent(new CustomEvent('panstart', { detail: e }))
  })
  hammer.on('panmove', function (e) {
    node.dispatchEvent(new CustomEvent('panmove', { detail: e }))
  })
  hammer.on('panend', function (e) {
    node.dispatchEvent(new CustomEvent('panend', { detail: e }))
  })
  
  return {
    destroy () {

    }
  }
}

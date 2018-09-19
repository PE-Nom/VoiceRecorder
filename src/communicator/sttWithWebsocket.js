import axios from 'axios'
// import WS from 'ws'

export default {
  wsURI: 'wss://stream.watsonplatform.net/speech-to-text/api/v1/recognize?watson-token=[TOKEN]&model=ja-JP_BroadbandModel&x-watson-learning-opt-out=1',
  getTokenForm: {
    method: 'GET',
    uri: 'https://192.168.10.6:8081/token'
  },
  message: {
    'action': 'start',
    'content-type': 'audio/wav',
    'continuous': true,
    'inactivity_timeout': -1
  },
  ws: null,
  connected: false,
  async wsopen () {
    let wsURI = null
    await axios.get(this.getTokenForm.uri)
      .then((response, body) => {
        console.log('token get')
        console.log(response)
        wsURI = this.wsURI.replace('[TOKEN]', response.data.token)
      })
      .catch(err => {
        console.log('err @ wsopen')
        console.log(err)
      })
    if (wsURI) {
      this.ws = new WebSocket(wsURI)
      this.ws.onmessage = function (evt) {
        console.log('onmessage event')
        console.log(evt.data)
        let data = JSON.parse(evt.data)
        if (data.state === 'listening') {
          console.log('listening')
          this.connected = true
        }
      }.bind(this)
      this.ws.onerror = function (evt) {
        console.log('onerror event')
        console.log(evt)
      }
      this.ws.onconnection = function (evt) {
        console.log('onconnection event')
        console.log(evt)
      }
      this.ws.onopen = function (evt) {
        console.log('onopen event')
        console.log(evt)
        let msg = JSON.stringify(this.message)
        console.log(msg)
        this.ws.send(msg)
      }.bind(this)
      this.ws.onclose = function (evt) {
        console.log('onclose event')
        console.log(evt)
        this.connected = false
      }.bind(this)
    }
  },
  wssend (chunk) {
    if (this.connected) {
      console.log('wssend')
      this.ws.send(chunk, {
        binary: true,
        // mask: false,
        mask: true
      })
    }
  },
  wsclose () {
    this.ws.close()
  }
}

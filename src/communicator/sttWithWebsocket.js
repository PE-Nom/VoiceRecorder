import axios from 'axios'
import store from '../store.js'

export default {
  wsURI: 'wss://stream.watsonplatform.net/speech-to-text/api/v1/recognize?watson-token=[TOKEN]&model=ja-JP_BroadbandModel&x-watson-learning-opt-out=1',
  getTokenForm: {
    method: 'GET',
    // uri: 'https://192.168.10.6:8081/token'
    // uri: 'https://192.168.1.4:8081/token'
    uri: 'https://pitsan.nomtech-pwa.com/token'
  },
  message: {
    'action': 'start',
    'content-type': 'audio/l16;rate=16000',
    'word_confidence': false,
    'timestamps': true,
    'interim_results': true,
    'word_alternatives_threshold': 0.01,
    'inactivity_timeout': 2
  },
  ws: null,
  connected: false,
  wssendcnt: 0,
  TOKEN: null,
  listeningCount: 0,
  async wsopen (openingMsg) {
    let wsURI = null
    if (!this.TOKEN) {
      await axios.get(this.getTokenForm.uri)
        .then((response, body) => {
          console.log('token get')
          console.log(response)
          this.TOKEN = response.data.token
          // wsURI = this.wsURI.replace('[TOKEN]', response.data.token)
        })
        .catch(err => {
          console.log('err @ wsopen')
          console.log(err)
          alert(err)
        })
    }
    if (this.TOKEN) {
      wsURI = this.wsURI.replace('[TOKEN]', this.TOKEN)
      this.ws = new WebSocket(wsURI)
      this.resetListeningCount()
      this.ws.onmessage = function (evt) {
        console.log('onmessage event')
        console.log(evt.data)
        let data = JSON.parse(evt.data)
        if (data.state) {
          if (data.state === 'listening') {
            this.setListening(true)
            this.incrementListeningCount()
            this.connected = true
          }
        }
        if (data.results) {
          this.setTranscript(data.results)
        }
      }.bind(this)
      this.ws.onerror = function (evt) {
        console.log('onerror event')
        console.log(evt)
        alert(evt)
      }
      this.ws.onconnection = function (evt) {
        console.log('onconnection event')
        console.log(evt)
      }
      this.ws.onopen = function (evt) {
        console.log('onopen event')
        console.log(evt)
        // console.log(this.message)
        // let msg = JSON.stringify(this.message)
        console.log(openingMsg)
        let msg = JSON.stringify(openingMsg)
        console.log(msg)
        this.ws.send(msg)
      }.bind(this)
      this.ws.onclose = function (evt) {
        console.log('onclose event')
        console.log(evt)
        if (this.connected) {
          this.setListening(false)
          this.connected = false
        }
      }.bind(this)
    }
    this.wssendcnt = 0
  },
  setTranscript (results) {
    console.log('setTranscript results.length : ' + results.length)
    console.log(results)
    let length = results[0].alternatives.length
    let transcript = results[0].alternatives[length - 1].transcript
    store.commit('setTranscript', {transcript: transcript})
    console.log('results[0].final : ' + results[0].final)
    if (results[0].final) {
      store.commit('setTranscribed', {transcribed: transcript})
    }
  },
  setListening (mode) {
    store.commit('setListening', {listening: mode})
  },
  resetListeningCount () {
    console.log('resetListeningCount')
    this.listeningCount = 0
    this.setListeningCount()
  },
  incrementListeningCount () {
    console.log('incrementListeningCount')
    this.listeningCount++
    this.setListeningCount()
  },
  setListeningCount () {
    store.commit('setListeningCount', {listeningCount: this.listeningCount})
  },
  wssend (chunk) {
    if (this.connected && this.ws.readyState === 1) {
      this.ws.send(chunk, {
        binary: true,
        // mask: false,
        mask: true
      })
      this.wssendcnt++
      if (this.wssendcnt % 20 === 0) {
        // console.log('store.commit')
        store.commit('setWsSendCount', {sendcnt: this.wssendcnt})
      }
    }
  },
  wsclose () {
    if (this.connected && this.ws.readyState === 1) {
      let closingMessage = { action: 'stop' }
      this.wssend(JSON.stringify(closingMessage))
      this.setListening(false)
      this.connected = false
      this.ws.close()
    }
  }
}

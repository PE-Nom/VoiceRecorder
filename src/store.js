import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

const store = new Vuex.Store({
  state: {
    transcript: '',
    transcribed: '',
    listening: false,
    wssendCount: 0,
    listeningCount: 0
  },
  getters: {
    transcript (state) { return state.transcript },
    transcribed (state) { return state.transcribed },
    listening (state) { return state.listening },
    wssendcount (state) { return state.wssendCount },
    listeningCount (state) { return state.listeningCount }
  },
  mutations: {
    setTranscript (state, payload) {
      state.transcript = payload.transcript
    },
    setTranscribed (state, payload) {
      state.transcribed = payload.transcribed
    },
    setListening (state, payload) {
      state.listening = payload.listening
    },
    setWsSendCount (state, payload) {
      state.wssendCount = payload.sendcnt
    },
    setListeningCount (state, payload) {
      state.listeningCount = payload.listeningCount
    }
  }
})

export default store

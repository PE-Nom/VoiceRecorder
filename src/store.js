import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

const store = new Vuex.Store({
  state: {
    transcript: '',
    listening: false,
    wssendCount: 0
  },
  getters: {
    transcript (state) { return state.transcript },
    listening (state) { return state.listening },
    wssendcount (state) { return state.wssendCount }
  },
  mutations: {
    setTranscript (state, payload) {
      state.transcript = payload.transcript
      console.log(state.transcript)
    },
    setListening (state, payload) {
      state.listening = payload.listening
      console.log(state.listening)
    },
    setWsSendCount (state, payload) {
      state.wssendCount = payload.sendcnt
    }
  }
})

export default store

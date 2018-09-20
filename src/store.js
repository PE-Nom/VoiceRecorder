import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

const store = new Vuex.Store({
  state: {
    transcript: '',
    listening: false
  },
  getters: {
    transcript (state) { return state.transcript },
    listening (state) { return state.listening }
  },
  mutations: {
    setTranscript (state, payload) {
      state.transcript = payload.transcript
      console.log(state.transcript)
    },
    setListening (state, payload) {
      state.listening = payload.listening
      console.log(state.listening)
    }
  }
})

export default store

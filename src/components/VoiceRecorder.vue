<template>
  <div class="VoiceRecoder">
    <canvas id="canvas" ref="canvas"></canvas>
    <div>
      <button id="start" v-if="!isRecording" v-on:click="start">録音開始</button>
      <button id="stop" v-else v-on:click="stop">録音終了</button>
    </div>
    <div>
      <p><audio id="audio" ref="audio" controls></audio></p>
      <p> listenig : {{listening}} </p>
      <p> WsSendCount : {{wssendcnt}} </p>
      <p> AudioProcessVnt : {{audioprocesscnt}} </p>
      <p>{{transcript}}</p>
    </div>
  </div>
</template>

<script>
import stt from '../communicator/sttWithWebsocket.js'
import sp from '../signalprocessor/audioSignalProcessor.js'

// "It is recommended for authors to not specify this buffer size and allow the implementation to pick a good
// buffer size to balance between latency and audio quality."
// https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createScriptProcessor
// however, webkitAudioContext (safari) requires it to be set'
// Possible values: null, 256, 512, 1024, 2048, 4096, 8192, 16384
const bufferSize = (typeof window.AudioContext === 'undefined' ? 4096 : null)

export default {
  name: 'VoiceRecorder',
  data () {
    return {
      msg: 'ボイスレコーダ',
      audiosource: null,
      mediaStream: null,
      isRecording: false,
      chunks: [],
      audio: null,
      audioContext: null,
      audioInput: null,
      audioAnalyser: null,
      audioRecorder: null,
      audioprocesscnt: 0
    }
  },
  computed: {
    transcript () {
      return this.$store.getters.transcript
    },
    listening () {
      return this.$store.getters.listening
    },
    wssendcnt () {
      return this.$store.getters.wssendcount
    }
  },
  watch: {
    listening: function (newVal, oldVal) {
      if (!newVal && oldVal && this.isRecording) {
        console.log('listening() computed value is chaned')
        this.stopRecorder()
      }
    }
  },
  methods: {
    onAudioChanged (event) {
      console.log('onAudioChanged')
      if (event.target.files.length) {
        // 選択されたファイル情報を取得
        this.audiosource = event.target.files[0]
        console.log(this.audiosource)
      } else {
        console.log('no file selected')
      }
    },
    async start () {
      if (!this.isRecording) {
        await stt.wsopen()
        await this.startRecorder()
      }
    },
    async startRecorder () {
      if (!this.isRecording) {
        this.chunks = []
        this.$store.commit('setTranscript', {transcript: ''})
        this.$store.commit('setWsSendCount', {sendcnt: 0})
        this.audioprocesscnt = 0
        sp.resetProcessor()
        this.createRecorder()
        this.isRecording = true
      }
    },
    async stop () {
      if (this.isRecording) {
        await stt.wsclose()
        await this.stopRecorder()
      }
    },
    async stopRecorder () {
      if (this.isRecording) {
        await this.audioRecorder.disconnect()
        await this.audioInput.disconnect()
        this.audioRecoder = null
        this.audioInput = null
        // await this.audioContext.close()
        this.isRecording = false
      }
    },
    audioprocess (e) {
      this.audioprocesscnt++
      let source = e.inputBuffer.getChannelData(0)
      let buffer = sp.downSample(source, this.audioContext.sampleRate)
      let data = sp.floatTo16BitPCM(buffer)
      // this.chunks.push(data)
      stt.wssend(data)
    },
    createRecorder () {
      // stop で audioContext.close() する場合、start で再度 construct する必要がある。
      // this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
      navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(stream => {
          let canvas = this.$refs.canvas
          let cw = canvas.width
          let ch = canvas.height
          let drawContext = canvas.getContext('2d')
          this.mediaStream = stream

          this.audioInput = this.audioContext.createMediaStreamSource(stream)
          this.audioRecorder = this.audioContext.createScriptProcessor(bufferSize, 1, 1)
          this.audioRecorder.onaudioprocess = this.audioprocess
          this.audioInput.connect(this.audioRecorder)
          this.audioRecorder.connect(this.audioContext.destination)

          this.audioAnalyser = this.audioContext.createAnalyser()
          this.audioAnalyser.fftSize = 2048
          this.audioInput.connect(this.audioAnalyser)
          let self = this
          function draw () {
            const array = new Uint8Array(self.audioAnalyser.fftSize)
            self.audioAnalyser.getByteTimeDomainData(array)
            const barWidth = cw / self.audioAnalyser.fftSize
            drawContext.fillStyle = 'rgba(0, 0, 0, 1)'
            drawContext.fillRect(0, 0, cw, ch)

            for (let i = 0; i < self.audioAnalyser.fftSize; ++i) {
              const value = array[i]
              const percent = value / 255
              const height = ch * percent
              const offset = ch - height

              drawContext.fillStyle = 'lime'
              drawContext.fillRect(i * barWidth, offset, barWidth, 2)
            }
            requestAnimationFrame(draw)
          }
          draw()
        })
        .catch(error => {
          console.log(error)
          alert(error)
        })
    }
  },
  mounted () {
    this.audio = this.$refs.audio
    // stop で audioContext.close() しなければ、mounted で construct しておけばよい。
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
  }
}
</script>

<style>
canvas {
  width: 100%;
  height: 256px;
}

button {
  padding: 0.5em 1em;
  border-width: 0;
  border-radius: 0.25em;
  font-size: 1em;
  background-color: #dfdfdf;
  color: #333;
}

button[disabled] {
  color: #aaa;
}
</style>

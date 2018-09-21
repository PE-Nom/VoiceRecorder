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
      audioprocesscnt: 0,
      audioBlob: null
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
    // レコーディング開始制御
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
    // レコーディング停止制御
    async stop () {
      if (this.isRecording) {
        await stt.wsclose()
        await this.stopRecorder()
        // wav file 作成
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
        this.createWavFile(this.concatChunks(), this.audioContext.sampleRate)
      }
    },
    // 音声信号処理
    audioprocess (e) {
      this.audioprocesscnt++
      let source = e.inputBuffer.getChannelData(0)
      let buffer = sp.downSample(source, this.audioContext.sampleRate)
      let data = sp.floatTo16BitPCM(null, 0, buffer)
      stt.wssend(data)
      //  レコーディング
      let chunk = source.slice()
      this.chunks.push(chunk)
    },
    // wav file 作成
    concatChunks () {
      console.log('concatChunks')
      let sampleLength = 0
      this.chunks.forEach(chunk => {
        sampleLength += chunk.length
      })
      // ここから結合
      let sampleCnt = 0
      let samples = new Float32Array(sampleLength)
      this.chunks.forEach(chunk => {
        chunk.forEach(sample => {
          samples[sampleCnt] = sample
          sampleCnt++
        })
      })
      return samples
    },
    writeString (view, offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
      }
    },
    createWavFile (samples, sampleRate) {
      let buffer = new ArrayBuffer(44 + samples.length * 2)
      let view = new DataView(buffer)
      this.writeString(view, 0, 'RIFF') // RIFFヘッダ
      view.setUint32(4, 32 + samples.length * 2, true) // これ以降のファイルサイズ
      this.writeString(view, 8, 'WAVE') // WAVEヘッダ
      this.writeString(view, 12, 'fmt ') // fmtチャンク
      view.setUint32(16, 16, true) // fmtチャンクのバイト数
      view.setUint16(20, 1, true) // フォーマットID
      view.setUint16(22, 1, true) // チャンネル数
      view.setUint32(24, sampleRate, true) // サンプリングレート
      view.setUint32(28, sampleRate * 2, true) // データ速度
      view.setUint16(32, 2, true) // ブロックサイズ
      view.setUint16(34, 16, true) // サンプルあたりのビット数
      this.writeString(view, 36, 'data') // dataチャンク
      view.setUint32(40, samples.length * 2, true) // 波形データのバイト数
      sp.floatTo16BitPCM(view, 44, samples) // 波形データ

      this.audioBlob = new Blob([view], { type: 'audio/wav' })
      this.audio.src = URL.createObjectURL(this.audioBlob)
    },
    // Web Audio API 生成
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
          console.log('bufferSize : ' + bufferSize)
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

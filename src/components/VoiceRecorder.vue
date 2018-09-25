<template>
  <div class="VoiceRecoder">
    <canvas id="canvas" ref="canvas"></canvas>
    <audio id="audio" ref="audio" controls></audio>
    <div>
      <button id="start" v-if="!isRecording" v-bind:disabled="isConverting || isWaitListening" v-on:click="start">録音開始</button>
      <button id="stop" v-else v-on:click="stop">録音終了</button>
      <button id="replay" v-bind:disabled="!audioBlob || isWaitListening || isRecording || isConverting" v-on:click="convertBlob">変換</button>
      <p>listenig : {{listening}}</p>
    </div>
    <div>
      <!--
      <p> WsSendCount : {{wssendcnt}} </p>
      <p> AudioProcessCnt : {{audioprocesscnt}} </p>
      -->
      <p>transcript : {{transcript}}</p>
      <p>result     : {{result}}</p>
    </div>
  </div>
</template>

<script>
import stt from '../communicator/sttWithWebsocket.js'
import sp from '../signalprocessor/audioSignalProcessor.js'
import ReadableBlobStream from 'readable-blob-stream'

// "It is recommended for authors to not specify this buffer size and allow the implementation to pick a good
// buffer size to balance between latency and audio quality."
// https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createScriptProcessor
// however, webkitAudioContext (safari) requires it to be set'
// Possible values: null, 256, 512, 1024, 2048, 4096, 8192, 16384
const bufferSize = (typeof window.AudioContext === 'undefined' ? 4096 : null)
const TIME_OUT_VAL = 720 // value of audioprocesscnt for recordinglimit 30sec
const MODE_REALTIME = 'realtime'
const MODE_BATCH = 'batch'

export default {
  name: 'VoiceRecorder',
  data () {
    return {
      mode: 'realtime',
      msg: 'ボイスレコーダ',
      audiosource: null,
      mediaStream: null,
      isRecording: false,
      isConverting: false,
      isWaitListening: false,
      chunks: [],
      audio: null,
      audioContext: null,
      audioInput: null,
      audioAnalyser: null,
      audioRecorder: null,
      audioprocesscnt: 0,
      audioBlob: null,
      recordlimit: false,
      result: ''
    }
  },
  computed: {
    transcript () {
      return this.$store.getters.transcript
    },
    transcribed () {
      return this.$store.getters.transcribed
    },
    listening () {
      return this.$store.getters.listening
    },
    listeningCount () {
      return this.$store.getters.listeningCount
    },
    wssendcnt () {
      return this.$store.getters.wssendcount
    }
  },
  watch: {
    listening: function (newVal, oldVal) {
      if (!newVal && oldVal && this.isRecording) {
        console.log('listening() computed value is changed true -> false')
        this.stopRecorder()
      } else if (newVal && !oldVal && !this.isRecording) {
        if (this.mode === MODE_REALTIME) {
          console.log('listening() computed value is changed false -> true in RealTime')
          this.startRecorder()
        } else if (this.mode === MODE_BATCH) {
          console.log('listening() computed value is changed false -> true in Batch')
          this.startConvert()
        }
      } else {
        console.log('watch listening')
      }
    },
    listeningCount: function (newVal, oldVal) {
      console.log(newVal)
      if (this.mode === MODE_BATCH && newVal === 2) {
        this.stopConvert()
      }
    },
    recordlimit: function (newVal, oldVal) {
      if (newVal && !oldVal) { // false -> true
        this.stop()
      }
    },
    transcribed: function (newVal, oldVal) {
      console.log('store.transcribed changed newVal : ' + newVal)
      if (this.result.length === 0) {
        this.result = newVal
      } else {
        this.result = this.result + ',' + newVal
      }
      console.log('result : ' + this.result)
    }
  },
  methods: {
    // 再変換開始制御
    async convertBlob () {
      console.log('convertBlob')
      if (!this.isRecording) {
        this.mode = MODE_BATCH
        let openingMsg = {
          'action': 'start',
          'content-type': 'audio/wav',
          'interim_results': true,
          'continuous': true,
          'inactivity_timeout': -1
        }
        await stt.wsopen(openingMsg)
        this.isWaitListening = true
      }
    },
    async startConvert () {
      console.log('startConvert')
      this.isConverting = true
      this.isWaitListening = false
      this.result = ''
      // listening になったら (watch listening から呼び出す)
      // audioBlob から readStream で読み出して、stt.wssend する
      let stream = new ReadableBlobStream(this.audioBlob)
      stream.on('error', error => {
        console.log('error with reading audioBlob')
        console.log(error)
      })
      stream.on('data', data => {
        console.log('read data from audioBlob ')
        stt.wssend(data)
      })
      stream.on('end', () => {
        console.log('read end from audioBlob')
        stt.wssend(Buffer.alloc(0), {binary: true, mask: true})
      })
    },
    stopConvert () {
      stt.wsclose()
      this.isConverting = false
      this.mode = MODE_REALTIME
    },
    // レコーディング開始制御
    async start () {
      if (!this.isRecording) {
        let openingMsg = {
          'action': 'start',
          'content-type': 'audio/l16;rate=16000',
          'word_confidence': false,
          'timestamps': true,
          'interim_results': true,
          'word_alternatives_threshold': 0.01,
          'inactivity_timeout': 2
        }
        await stt.wsopen(openingMsg)
        this.isWaitListening = true
      }
    },
    async startRecorder () {
      if (!this.isRecording) {
        this.result = ''
        this.chunks = []
        this.recordlimit = false
        this.$store.commit('setTranscript', {transcript: ''})
        this.$store.commit('setWsSendCount', {sendcnt: 0})
        this.audioprocesscnt = 0
        sp.resetProcessor()
        this.createRecorder()
        console.log('isRecording set true')
        this.isRecording = true
        this.isWaitListening = false
      }
    },
    // レコーディング停止制御
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
        // wav file 作成
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
      if (this.audioprocesscnt > TIME_OUT_VAL) {
        this.recordlimit = true
      }
    },
    // wav file 作成
    concatChunks () {
      console.log('concatChunks')
      let sampleLength = 0
      this.chunks.forEach(chunk => {
        sampleLength += chunk.length
      })
      console.log('sampleLength : ' + sampleLength)
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
          this.mediaStream = stream
          this.audioInput = this.audioContext.createMediaStreamSource(stream)
          this.audioRecorder = this.audioContext.createScriptProcessor(bufferSize, 1, 1)
          this.audioRecorder.onaudioprocess = this.audioprocess
          this.audioInput.connect(this.audioRecorder)
          this.audioRecorder.connect(this.audioContext.destination)

          // --- Audio Visualize
          this.audioAnalyser = this.audioContext.createAnalyser()
          this.audioInput.connect(this.audioAnalyser)
          let canvas = this.$refs.canvas
          canvas.height = 64
          let cw = canvas.width
          let ch = canvas.height
          let drawContext = canvas.getContext('2d')
          let self = this
          // --
          /*
          this.audioAnalyser.fftSize = 2048
          const array = new Uint8Array(self.audioAnalyser.fftSize)
          const barWidth = cw / self.audioAnalyser.fftSize
          function draw () {
            self.audioAnalyser.getByteTimeDomainData(array)
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
          */
          // --
          this.audioAnalyser.fftSize = 512
          const bufferLength = this.audioAnalyser.frequencyBinCount
          const array = new Uint8Array(bufferLength)
          const barWidth = (cw / bufferLength) * 2.5

          function renderFrame () {
            self.audioAnalyser.getByteFrequencyData(array)
            drawContext.fillStyle = 'rgba(0, 0, 0, 1)'
            drawContext.fillRect(0, 0, cw, ch)
            let x = 0

            for (var i = 0; i < bufferLength; i++) {
              let barHeight = array[i]
              var r = barHeight + (25 * (i / bufferLength))
              var g = 250 * (i / bufferLength)
              var b = 50
              drawContext.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')'
              // drawContext.fillRect(x, ch - barHeight, barWidth, barHeight)
              drawContext.fillRect(x, ch - array[i] / 4, barWidth, barHeight)
              if (ch < barHeight) {
                console.log('Over Ch : ' + ch + ', ' + barHeight)
              }
              x += barWidth + 1
            }
            requestAnimationFrame(renderFrame)
          }
          renderFrame()
          // --
          /*
          this.audioAnalyser.fftSize = 2048
          const array = new Uint8Array(self.audioAnalyser.fftSize)
          function draw () {
            // ask the browser to schedule a redraw before the next repaint
            requestAnimationFrame(draw)

            // clear the canvas
            drawContext.fillStyle = 'rgba(0, 0, 0, 1)'
            drawContext.fillRect(0, 0, cw, ch)

            drawContext.lineWidth = 2
            drawContext.strokeStyle = '#f00'
            drawContext.beginPath()

            let sliceWidth = cw * 1.0 / self.audioAnalyser.fftSize
            let x = 0

            self.audioAnalyser.getByteTimeDomainData(array)

            for (let i = 0; i < self.audioAnalyser.fftSize; i++) {
              let v = array[i] / 128.0
              let y = v * ch / 2
              i === 0 ? drawContext.moveTo(x, y) : drawContext.lineTo(x, y)
              x += sliceWidth
            }
            drawContext.lineTo(cw, ch / 2)
            drawContext.stroke()
          }
          draw()
          */
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

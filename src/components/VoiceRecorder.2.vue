<template>
  <div class="VoiceRecoder">
    <canvas id="canvas" ref="canvas"></canvas>
    <div>
      <button id="start" v-if="!isRecording" v-on:click="start">録音開始</button>
      <button id="stop" v-else v-on:click="stop">録音終了</button>
    </div>
    <div>
      <p><audio id="audio" ref="audio" controls></audio></p>
      <p>{{transcribed}}</p>
    </div>
  </div>
</template>

<script>
import stt from '../communicator/sttWithWebsocket.js'
export default {
  name: 'VoiceRecorder',
  data () {
    return {
      msg: 'ボイスレコーダ',
      audiosource: null,
      mediaRecoder: null,
      mediaStream: null,
      isRecording: false,
      chunks: [],
      audio: null,
      transcribed: ''
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
      console.log('start')
      this.chunks = []
      await stt.wsopen()
      this.createStream()
      console.log(this.mediaStream)
      this.isRecording = true
    },
    async stop () {
      console.log('stop')
      await stt.wsclose()
      this.isRecording = false
      // this.mediaRecoder.stop()
      // this.mediaRecoder = null
    },
    dataarrival (event) {
      console.log('dataarrival')
      console.log(event)
      if (event.data.size > 0) {
        this.chunks.push(event.data)
        stt.wssend(event.data)
      }
      this.audio.src = URL.createObjectURL(event.data)
      this.audio.play()
    },
    // マイク機能の使用許可が出たときの処理
    createStream () {
      navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(stream => {
          console.log('navigator.mediaDevices.getUserMedia')
          console.log(this.$refs.canvas)
          let bufferSize = 2048
          let canvas = this.$refs.canvas
          let cw = canvas.width
          let ch = canvas.height
          let drawContext = canvas.getContext('2d')
          console.log(drawContext)
          this.mediaStream = stream

          const audioContext = new AudioContext()
          const source = audioContext.createMediaStreamSource(stream)
          const processor = audioContext.createScriptProcessor(bufferSize, 1, 1)
          const analyser = audioContext.createAnalyser()
          analyser.fftSize = 2048
          source.connect(analyser)
          source.connect(processor)
          processor.connect(audioContext.destination)
          // 1024bitのバッファサイズに達するごとにaudioDataにデータを追加する
          processor.onaudioprocess = function (e) {
            console.log('onaudioprocess')
            let input = e.inputBuffer.getChannelData(0)
            let bufferData = new Float32Array(bufferSize)
            // float to 16bit PCM
            for (var i = 0; i < bufferSize; i++) {
              let s = Math.max(-1, Math.min(1, input[i]))
              bufferData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
            }
            this.chunks.push(bufferData)
            stt.wssend(bufferData)
          }.bind(this)

          function draw () {
            const array = new Uint8Array(analyser.fftSize)
            analyser.getByteTimeDomainData(array)
            const barWidth = cw / analyser.fftSize
            drawContext.fillStyle = 'rgba(0, 0, 0, 1)'
            drawContext.fillRect(0, 0, cw, ch)

            for (let i = 0; i < analyser.fftSize; ++i) {
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
        })
    }
  },
  mounted () {
    console.log('mounted')
    this.audio = this.$refs.audio
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

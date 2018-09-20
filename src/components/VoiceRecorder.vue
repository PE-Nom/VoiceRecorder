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
import bufferFrom from 'buffer-from'
import stt from '../communicator/sttWithWebsocket.js'

const TARGET_SAMPLE_RATE = 16000
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
      mediaRecoder: null,
      mediaStream: null,
      isRecording: false,
      chunks: [],
      audio: null,
      transcribed: '',
      audioContext: null,
      audioInput: null,
      audioAnalyser: null,
      audioRecorder: null,
      bufferUnusedSamples: []

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
      console.log(this.mediaStream)
      await stt.wsopen()
      this.isRecording = true
      this.chunks = []
      // this.audioInput.connect(this.audioRecorder)
      // this.audioInput.connect(this.audioAnalyser)
      // let options = {
      //   audioBitsPerSecond: 128000,
      //   videoBitsPerSecond: 2500000,
      //   mimeType: 'audio/webm'
      // }
      // this.mediaRecoder = new MediaRecorder(this.mediaStream, {mimeType: 'audio/webm;codecs=opus'})
      // this.mediaRecoder = new MediaRecorder(this.mediaStream, options)
      /*
      console.log('mediaRecoed support audio/wav : ' + MediaRecorder.isTypeSupported('audio/wav'))
      console.log('mediaRecoed support audio/webm : ' + MediaRecorder.isTypeSupported('audio/webm'))
      console.log('mediaRecoed support audio/flac : ' + MediaRecorder.isTypeSupported('audio/flac'))
      console.log('mediaRecoed support audio/mp3 : ' + MediaRecorder.isTypeSupported('audio/mp3'))
      console.log('mediaRecoed support audio/mpeg : ' + MediaRecorder.isTypeSupported('audio/mpeg'))
      console.log('mediaRecoed support audio/opus : ' + MediaRecorder.isTypeSupported('audio/opus'))
      this.mediaRecoder.addEventListener('stop', function (e) { console.log('mediaRecoder stop') })
      this.mediaRecoder.addEventListener('dataavailable', this.dataarrival)
      console.log(this.mediaRecoder)
      this.mediaRecoder.start(3000)
      */
    },
    async stop () {
      console.log('stop')
      await stt.wsclose()
      this.audioInput.disconnect()
      this.isRecording = false
      this.stream.stop()
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
      // this.audio.src = URL.createObjectURL(event.data)
      // this.audio.play()
    },
    floatTo16BitPCM (input) {
      let output = new DataView(new ArrayBuffer(input.length * 2)) // length is in bytes (8-bit), so *2 to get 16-bit length
      for (let i = 0; i < input.length; i++) {
        let multiplier = input[i] < 0 ? 0x8000 : 0x7fff // 16-bit signed range is -32768 to 32767
        output.setInt16(i * 2, (input[i] * multiplier) | 0, true) // index, value ("| 0" = convert to 32-bit int, round towards 0), littleEndian.
      }
      return bufferFrom(output.buffer)
    },
    downSample (bufferNewSamples) {
      let buffer = null
      let newSamples = bufferNewSamples.length
      let unusedSamples = this.bufferUnusedSamples.length
      let i
      let offset

      if (unusedSamples > 0) {
        buffer = new Float32Array(unusedSamples + newSamples)
        for (i = 0; i < unusedSamples; ++i) {
          buffer[i] = this.bufferUnusedSamples[i]
        }
        for (i = 0; i < newSamples; ++i) {
          buffer[unusedSamples + i] = bufferNewSamples[i]
        }
      } else {
        buffer = bufferNewSamples
      }

      // Downsampling and low-pass filter:
      // Input audio is typically 44.1kHz or 48kHz, this downsamples it to 16kHz.
      // It uses a FIR (finite impulse response) Filter to remove (or, at least attinuate)
      // audio frequencies > ~8kHz because sampled audio cannot accurately represent
      // frequiencies greater than half of the sample rate.
      // (Human voice tops out at < 4kHz, so nothing important is lost for transcription.)
      // See http://dsp.stackexchange.com/a/37475/26392 for a good explination of this code.
      const filter = [
        -0.037935,
        -0.00089024,
        0.040173,
        0.019989,
        0.0047792,
        -0.058675,
        -0.056487,
        -0.0040653,
        0.14527,
        0.26927,
        0.33913,
        0.26927,
        0.14527,
        -0.0040653,
        -0.056487,
        -0.058675,
        0.0047792,
        0.019989,
        0.040173,
        -0.00089024,
        -0.037935
      ]
      const samplingRateRatio = this.audioContext.sampleRate / TARGET_SAMPLE_RATE
      const nOutputSamples = Math.floor((buffer.length - filter.length) / samplingRateRatio) + 1
      const outputBuffer = new Float32Array(nOutputSamples)

      for (i = 0; i + filter.length - 1 < buffer.length; i++) {
        offset = Math.round(samplingRateRatio * i)
        var sample = 0
        for (var j = 0; j < filter.length; ++j) {
          sample += buffer[offset + j] * filter[j]
        }
        outputBuffer[i] = sample
      }

      const indexSampleAfterLastUsed = Math.round(samplingRateRatio * i)
      const remaining = buffer.length - indexSampleAfterLastUsed
      if (remaining > 0) {
        this.bufferUnusedSamples = new Float32Array(remaining)
        for (i = 0; i < remaining; ++i) {
          this.bufferUnusedSamples[i] = buffer[indexSampleAfterLastUsed + i]
        }
      } else {
        this.bufferUnusedSamples = new Float32Array(0)
      }
      return outputBuffer
    },
    audioprocess (e) {
      console.log('### audioprocess ###')
      console.log(e.inputBuffer)
      let source = e.inputBuffer.getChannelData(0)
      let buffer = this.downSample(source)
      let data = this.floatTo16BitPCM(buffer)
      this.chunks.push(data)
      stt.wssend(data)
    }
  },
  mounted () {
    console.log('mounted')
    this.audio = this.$refs.audio
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(stream => {
        console.log('navigator.mediaDevices.getUserMedia')
        console.log(this.$refs.canvas)
        let canvas = this.$refs.canvas
        let cw = canvas.width
        let ch = canvas.height
        let drawContext = canvas.getContext('2d')
        console.log(drawContext)
        this.mediaStream = stream

        this.audioContext = new AudioContext()
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
      })
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

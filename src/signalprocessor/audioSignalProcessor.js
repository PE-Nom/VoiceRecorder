import bufferFrom from 'buffer-from'

const TARGET_SAMPLE_RATE = 16000

export default {

  // Downsampling and low-pass filter:
  // Input audio is typically 44.1kHz or 48kHz, this downsamples it to 16kHz.
  // It uses a FIR (finite impulse response) Filter to remove (or, at least attinuate)
  // audio frequencies > ~8kHz because sampled audio cannot accurately represent
  // frequiencies greater than half of the sample rate.
  // (Human voice tops out at < 4kHz, so nothing important is lost for transcription.)
  // See http://dsp.stackexchange.com/a/37475/26392 for a good explination of this code.
  filter: [
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
  ],
  bufferUnusedSamples: [],
  resetProcessor () {
    this.bufferUnusedSamples = []
  },
  floatTo16BitPCM (output, offset, input) {
    if (!output) {
      output = new DataView(new ArrayBuffer(input.length * 2)) // length is in bytes (8-bit), so *2 to get 16-bit length
    }
    for (let i = 0; i < input.length; i++) {
      let multiplier = input[i] < 0 ? 0x8000 : 0x7fff // 16-bit signed range is -32768 to 32767
      output.setInt16(offset + i * 2, (input[i] * multiplier) | 0, true) // index, value ("| 0" = convert to 32-bit int, round towards 0), littleEndian.
    }
    return bufferFrom(output.buffer)
  },
  downSample (bufferNewSamples, sampleRate) {
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

    const samplingRateRatio = sampleRate / TARGET_SAMPLE_RATE
    const nOutputSamples = Math.floor((buffer.length - this.filter.length) / samplingRateRatio) + 1
    const outputBuffer = new Float32Array(nOutputSamples)

    for (i = 0; i + this.filter.length - 1 < buffer.length; i++) {
      offset = Math.round(samplingRateRatio * i)
      var sample = 0
      for (var j = 0; j < this.filter.length; ++j) {
        sample += buffer[offset + j] * this.filter[j]
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
  }
}

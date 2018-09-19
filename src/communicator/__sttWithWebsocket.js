// 'use strict';

// var fs = require('fs');
var request = require('request')
var WS = require('ws')

var wsURI = 'wss://stream.watsonplatform.net/speech-to-text/api/v1/recognize?watson-token=[TOKEN]&model=ja-JP_BroadbandModel&x-watson-learning-opt-out=1'
var getTokenForm = {
  method: 'GET',
  uri: 'https://6b271ebf-8278-47c5-bab0-0a17c148e767:8xJzwiNHnxY2@stream.watsonplatform.net/authorization/api/v1/token?url=https://stream.watsonplatform.net/speech-to-text/api'
}
// var filepath = './wav/asano.wav';
var wsevents = ['message', 'error', 'close', 'open', 'connection']

request(getTokenForm, function (error, response, body) {
  if (error) {
    console.log('error @ request')
    console.log(error)
  } else {
    wsURI = wsURI.replace('[TOKEN]', body)
    var message = {
      'action': 'start',
      'content-type': 'audio/wav',
      'continuous': true,
      'inactivity_timeout': -1
    }
    var ws = new WS(wsURI)
    wsevents.forEach(function (eventName) {
      ws.on(eventName, console.log.bind(console, eventName + ' event: '))
    })
    ws.on('open', function (evt) {
      ws.send(JSON.stringify(message))
    })
    ws.on('close', function (data) {
      console.log(data)
    })
  }
})

var axios = require('axios')
var express = require('express')
var app = express()
var fs = require('fs')
var https = require('https')
var bodyParser = require('body-parser')
var multer = require('multer')
// var path = require('path')

const options = {
  key: fs.readFileSync('../build/cert/server.key'),
  cert: fs.readFileSync('../build/cert/server.crt')
//   key: fs.readFileSync('C:/Bitnami/redmine-3.4.6-1/apache2/conf/server.key'),
//   cert: fs.readFileSync('C:/Bitnami/redmine-3.4.6-1/apache2/conf/server.crt')
}
// const folderPath = 'C:/Bitnami/redmine-3.4.6-1/apache2/htdocs/data'
// const folderPath = 'C:/home/apache/htdocs/JS/data/'
// const folderPath = '/var/www/html/JS/data/'
// CORSを許可する
const getTokenForm = {
  method: 'GET',
  uri: 'https://6b271ebf-8278-47c5-bab0-0a17c148e767:8xJzwiNHnxY2@stream.watsonplatform.net/authorization/api/v1/token?url=https://stream.watsonplatform.net/speech-to-text/api'
}

app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  next()
})

app.use(bodyParser.urlencoded({ extended: false }))
app.use(multer({dest: './tmp/', limits: {fieldSize: 204800 * 1024}}).single('file'))

app.get('/token', function (req, res) {
  axios.get(getTokenForm.uri)
    .then((response, body) => {
      console.log('request success')
      console.log(body)
      console.log(response.data)
      res.end(JSON.stringify(response.data))
    })
    .catch(err => {
      console.log('error @ request')
      console.log(err)
    })
})

const port = 8081
// var server = app.listen(port, function () {
//  var host = server.address().address
//  var port = server.address().port
//  console.log(path.join(__dirname, '/public/images'))
//  console.log('listening at http://%s:%s', host, port)
// })
// ----------
var server = https.createServer(options, app)
server.listen(port)

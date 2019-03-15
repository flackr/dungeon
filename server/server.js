/**
 * Dungeon Server
 */
var socketio = 'socket.io';

var app;
try {
  app = require('http').createServer(handler),
  io = require(socketio).listen(app),
  fs = require('fs'),
  path = require('path');

} catch (e) {
  console.log('Error loading pre-requisite libraries.  Try npm install socket.io?');
}

io.set('log level', 1); // reduce logging.

var dungeon = require('./client/js/dungeon-common.js');

var port = process.env.PORT;
if (process.argv.length > 2) {
    port = parseInt(process.argv[2]);
}
app.listen(port);
console.log('Listening on port ' + port);

/**
 * Returns if the string ends with the provided suffix.
 * @param {string} suffix The suffix to check for at the end of the string.
 * @return {bool} True if the string ends with suffix.
 */
String.prototype.endsWith = function(suffix) {
  return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

/**
 * Guesses the MIME type of a file given the file name.
 * @param {string} filePath The complete path to the file.
 * @return {string} The guessed MIME type of the file.
 */
function guessMimeType(filePath) {
  if (filePath.endsWith('.html'))
    return 'text/html';
  else if (filePath.endsWith('.css'))
    return 'text/css';
  else if (filePath.endsWith('.js'))
    return 'text/javascript';
  return 'text/plain';
}

/**
 * Handles an HTTP request.
 * @param {http.ServerRequest} req The request details.
 * @param {http.ServerResponse} res The corresponding response object.
 */
function handler(req, res) {
  var filePath = 'client' + (req.url == '/' ? '/index.html' : req.url);
  var existsFunc = fs.exists || path.exists;
  existsFunc(filePath, function(exists) {
    if (exists) {
      fs.readFile(filePath, function(error, content) {
        if (error) {
          res.writeHead(500);
          res.end();
        } else {
          res.writeHead(200, { 'Content-Type': guessMimeType(filePath) });
          res.end(content, 'utf-8');
        }
      });
    } else {
        console.log('Request received for non-existant file: ' + filePath);
        res.writeHead(404);
      res.end();
    }
  });
}

dungeon.Server = function() {
  dungeon.Game.apply(this);
  this.initialize();
  this.clients = [];

  io.sockets.on('connection', this.clientConnected.bind(this));
}

dungeon.Server.prototype = {
  __proto__: dungeon.Game.prototype,

  /**
   * Handles a new client socket connection.
   * @param {io.Socket} socket The client socket.
   */
  clientConnected: function(socket) {
    this.clients.push(socket);
    socket.on('disconnect', this.clientDisconnected.bind(this, socket));
    socket.on('e', this.eventReceived.bind(this));

    // Tell the client everything that's happened thus far.
    for (var i = 0; i < this.events.length; i++)
      socket.emit('e', JSON.parse(this.events[i]));
  },

  /**
   * Handles a client disconnection.
   * @param {io.Socket} socket The socket of the disconnected client.
   */
  clientDisconnected: function(socket) {
    var i = this.clients.indexOf(socket);
    if (i != -1)
      this.clients.splice(i, 1);
  },

  eventReceived: function(id, eventData) {
    if (this.processEvent(eventData)) {
      io.sockets.emit('e', eventData);
    }
  }
};

new dungeon.Server();

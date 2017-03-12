import { Readable, Writable } from 'stream';
import ansiEscapes from 'ansi-escapes';

const ESC      = '\u001b[',
      UP       = "#{ESC}A",
      DOWN     = "#{ESC}B",
      FORWARD  = "#{ESC}C",
      BACKWARD = "#{ESC}D";

export class InputStream extends Readable {
  constructor (io) {
    super(...arguments);

    this.io = io;
    this.data = '';
  }

  _read () {
    return this.io.onVTKeystroke = this.io.sendString = str => {
      str = (() => {
        switch(str) {
          case UP: return ansiEscapes.cursorUp();
          case DOWN: return ansiEscapes.cursorDown();
          case FORWARD: return ansiEscapes.cursorForward();
          case BACKWARD: return ansiEscapes.cursorBackward();
          default: return str;
        }
      })();

      this._data += str;

      return this.push(str);
    };
  }

  pause () {
    super.pause(...arguments);

    return this.emit('pause');
  }

  resume () {
    super.resume(...arguments);

    return this.emit('resume');
  }
}

export class OutputStream extends Writable {
  constructor (io) {
    super(...arguments);

    this.io = io;
  }

  _write (data, enc, next) {
    this.io.writeUTF8(data.toString());

    return next();
  }
}

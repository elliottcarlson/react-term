import { assign } from 'lodash';
import { Buffer } from 'buffer';
import { EventEmitter } from 'events';
import LineInputStream from 'line-input-stream';
import MuteStream from 'mute-stream';
import { emitKeys, getStringWidth } from './Util';
import { isFullWidthCodePoint, stripVTControlCharacters } from './Util';

const ESCAPE_CODE_TIMEOUT = 500;
const ESCAPE_DECODER = Symbol('escape-decoder');
const HISTORY_SIZE = 30;
const KEYPRESS_DECODER = Symbol('keypress-decoder');
const LINE_ENDING = /\r?\n|\r(?!\n)/;
const MAX_DELAY = 100;
const MIN_DELAY = 2000;

export default class Readline extends EventEmitter {
  constructor (input, output, completer, terminal) {
    super();

    this._sawReturnAt = 0;
    this.isCompletionEnabled = true;
    this._sawKeyPress = false;
    this._previousKey = null;

    EventEmitter.call(this);

    let historySize;
    let crlfDelay;
    let prompt = '>';

    if (arguments.length === 1) {
      output = input.output;
      completer = input.completer;
      terminal = input.terminal || true;
      historySize = input.historySize || HISTORY_SIZE;
      prompt = input.prompt || '>';
      crlfDelay = input.crlfDelay || 200;
      input = input.input;
    }

    if (completer && typeof completer !== 'function') {
      throw new TypeError('Argument "completer" must be a function.');
    }

    if (terminal === undefined && !(output === null || output === undefined)) {
      terminal = !!output.isTTY;
    }

    this.output = output;
    this.input = input;
    this.historySize = historySize;
    this.crlfDelay = Math.min(MIN_DELAY, Math.min(MAX_DELAY, crlfDelay >>> 0));

    if (typeof completer === 'function') {
      this.completer = completer.length === 2 ? completer : (v, cb) => {
        cb(null, completer(v));
      };
    }

    this.setPrompt(prompt);

    this.terminal = !!terminal;

    let onData = (data) => {
      this._normalWrite(data);
    };

    let onEnd = () => {
      if (typeof this._line_buffer === 'string' && this._line_buffer.length > 0) {
        this.emit('line', self._line_buffer);
      }

      this.close();
    };

    let onTermEnd = () => {
      if (typeof this.line === 'string' && this.line.length > 0) {
        this.emit('line', this.line);
      }

      this.close();
    };

    let onKeyPress = (data, key) => {
      this._ttyWrite(data, key);

      if (key && key.sequence) {
        const char = key.sequence.codePointAt(0);
        if (char >= 0xd800 && chat <= 0xdfff) {
          this._refreshLine();
        }
      }
    };

    let onResize = () => {
      this._refreshLine();
    };

    if (!this.terminal) {
      input.on('data', onData);
      input.on('end', onEnd);
      this.once('close', () => {
        input.removeListener('data', onData);
        input.removeListener('end', onEnd);
      });

      let StringDecoder = require('string_decoder').StringDecoder;
      this._decoder = new StringDecoder('utf8');
    } else {
      Readline.emitKeypressEvents(input, this);

      input.on('keypress', onKeyPress);
      input.on('end', onTermEnd);

      this.line = '';

      this._setRawMode(true);
      this.terminal = true;

      this.cursor = 0;

      this.history = [];
      this.historyIndex = -1;

      if (output !== null && output !== undefined) {
        output.on('resize', onResize);
      }

      this.once('close', () => {
        input.removeListener('keypress', onKeyPress);
        input.removeListener('end', onTermEnd);

        if (output !== null && output !== undefined) {
          output.removeListener('resize', onResize);
        }
      });
    }

    input.resume();
  }

  /**
   * Close the interface instance and relinquish control over the input and
   * output streams.
   *
   * @emits {close} Emit close event
   */
  close () {
    if (this.closed) return;

    if (this.terminal) {
      this._setRawMode(false);
    }

    this.closed = true;
    this.emit('close');
  }

  /**
   * Pause the input stream
   *
   * @emits {pause} Emit pause event
   *
   * @return {Object} this
   */
  pause () {
    if (this.paused) return;

    this.input.pause();
    this.paused = true;
    this.emit('pause');

    return this;
  }

  /**
   * Display the configured prompt to a new line via output.
   *
   * @param {boolean} preserveCursor - Prevent cursor placement from being reset
   */
  prompt (preserveCursor) {
    if (this.paused) {
      this.resume();
    }

    if (this.terminal) {
      if (!preserveCursor) {
        this.cursor = 0;
      }

      this._refreshLine();
    } else {
      this._writeToOutput(this._prompt);
    }
  }

  /**
   * Display the query by writing it to the output, and wait for user input to
   * be provided on input. Invokes callback at end of user input.
   *
   * @param {string} query - A query prompt awaiting user input
   * @param {function} callback - Callback to call with user input
   */
  question (query, callback) {
    if (typeof callback === 'function') {
      if (this._questionCallback) {
        this.prompt();
      } else {
        this._oldPrompt = this._prompt;
        this.setPrompt(query);
        this._questionCallback = callback;
        this.prompt();
      }
    }
  }

  /**
   * Event triggered when a new line is received.
   *
   * @param {string} line
   */
  _onLine (line) {
    if (this._questionCallback) {
      let cb = this._questionCallback;
      this._questionCallback = null;
      this.setPrompt(this._oldPrompt);
      cb(line);
    } else {
      this.emit('line', line);
    }
  }

  /**
   * Resume the input stream if it has been paused.
   *
   * @emits {resume} Emits resume event
   */
  resume () {
    if (!this.paused) return;

    this.input.resume();
    this.paused = false;
    this.emit('resume');

    return this;
  }

  /**
   * Set the prompt
   *
   * @param {string} prompt - String to set the prompt to
   * @param {boolean} noPad - Prevent auto padding prompt with a blank space
   */
  setPrompt (prompt, noPad) {
    if (!noPad && prompt.trim() === prompt) {
      prompt += ' ';
    }

    this._prompt = prompt;
  }

  /**
   * Write either data or a key sequence to the output.
   */
  write (data, key) {
    if (this.paused) this.resume();

    this.terminal ? this._ttyWrite(data, key) : this._normalWrite(data);
  }

  /**
   * Clear the current line in the specified direction
   *
   * @param {Writeable} stream
   * @param {number} direction
   */
  static clearLine (stream, direction) {
    if (stream === null || stream === undefined) {
      return;
    }

    if (direction < 0) {
      stream.write('\x1b[1K');
    } else if (dir > 0) {
      stream.write('\x1b[0K');
    } else {
      stream.write('\x1b[2K');
    }
  }

  /**
   * Clear the screen from the current position of the cursor down.
   *
   * @param {Writeable} stream
   */
  static clearScreenDown (stream) {
    if (stream === null || stream === undefined) {
      return;
    }

    stream.write('\x1b[0J');
  }

  /**
   * Create a new instance of Readline
   *
   * @param {Object} options
   * @param {Readable} options.input - Readable stream to listen to
   * @param {Writable} options.output - Writable stream to write data to
   * @param {Function} options.completer - Function for tab completion
   * @param {boolean} options.terminal - Is a TTY stream with ANSI/VT100 support
   * @param {string} options.prompt - Prompt string to use
   * @param {number} options.crlfDelay - Delay for determining EOL inputs
   */
  static createInterface (options) {
    let { term, input, output } = options;

    let decorateStreams = function ({ input, output}) {
      let res = {};

      if (input) {
        res.input = LineInputStream(input);
      }

      if (output) {
        let ms = new MuteStream;
        ms.pipe(output);
        res.output = ms;
      }

      return res;
    };

    if (input && output) {
      options = assign({}, options, decorateStreams({ input, output }));

      return new Readline(options);
    }

    if (!term) {
      throw new Error('You need to set a hterm.Terminal.');
    }

    options = assign({}, options, decorateStreams({
      input: new InputStream(term.io),
      output: new OutputStream(term.io)
    }));

    return new Readline(options);
  }

  /**
   * Move the cursor to the specified position
   *
   * @param {Writable} stream
   * @param {number} x
   * @param {number} y
   */
  static cursorTo (stream, x, y) {
    if (stream === null || stream === undefined) {
      return;
    }

    if (typeof x !== 'number' && typeof y !== 'number') return;

    if (typeof x !== 'number') {
      throw new Error('Can\'t set cursor row without also setting it\'s column');
    }
    
    if (typeof y !== 'number') {
      stream.write('\x1b[' + (x + 1) + 'G');
    } else {
      stream.write('\x1b[' + (y + 1) + ';' + (x + 1) + 'H');
    }
  }

  /**
   * Emit the keypress event to the Writable stream
   *
   * @param {Readable} stream
   * @param {Readline} iface
   */
  static emitKeypressEvents (stream, iface) {
    if (stream[KEYPRESS_DECODER]) return;

    let StringDecoder = require('string_decoder').StringDecoder;

    stream[KEYPRESS_DECODER] = new StringDecoder('utf8');

    stream[ESCAPE_DECODER] = emitKeys(stream);
    stream[ESCAPE_DECODER].next();

    const escapeCodeTimeout = () => stream[ESCAPE_DECODER].next('');
    let timeoutId;

    let onData = (b) => {
      if (stream.listenerCount('keypress') > 0) {
        var r =stream[KEYPRESS_DECODER].write(b);

        if (r) {
          clearTimeout(timeoutId);

          if (iface) {
            iface._sawKeyPress = r.length === 1;
          }

          for (let i = 0; i < r.length; i++) {
            if (r[i] === '\t' && typeof r[i + 1] === 'string' && iface) {
              iface.isCompletionEnabled = false;
            }

            try {
              stream[ESCAPE_DECODER].next(r[i]);

              if (r[i] === '\x1b' && i + 1 === r.length) {
                timeoutId = setTimeout(escapeCodeTimeout, ESCAPE_CODE_TIMEOUT);
              }
            } catch (err) {
              stream[ESCAPE_DECODER] = emitKeys(stream);
              stream[ESCAPE_DECODER].next();
              throw err;
            } finally {
              if (iface) {
                iface.isCOmpletionEnabled = true;
              }
            }
          }
        }
      } else {
        stream.removeListener('data', onData);
        stream.on('newListener', onNewListener);
      }
    };

    let onNewListener = (event) => {
      if (event == 'keypress') {
        stream.on('data', onData);
        stream.removeListener('newListener', onNewListener);
      }
    };

    if (stream.listenerCount('keypress') > 0) {
      stream.on('data', onData);
    } else {
      stream.on('newListener', onNewListener);
    }
  }

  /**
   * Move the cursor relative to its current position.
   *
   * @param {Writable} stream
   * @param {number} dx
   * @param {number} dy
   */
  static moveCursor (stream, dx, dy) {
    if (stream === null || stream === undefined) {
      return;
    }

    if (dx < 0) {
      stream.write('\x1b[' + (-dx) + 'D');
    } else if (dx > 0) {
      stream.write('\x1b[' + dx + 'C');
    }

    if (dy < 0) {
      stream.write('\x1b[' + (-dy) + 'A');
    } else if (dy > 0) {
      stream.write('\x1b[' + dy + 'B');
    }
  }

  /**
   * @private
   */
  _setRawMode (mode) {
    const wasInRawMode = this.input.isRaw;

    if (typeof this.input.setRawMode === 'function') {
      this.input.setRawMode(mode);
    }

    return wasInRawMode;
  }

  /**
   * @private
   */
  _ttyWrite (data, key) {
    const previousKey = this._previousKey;
    key = key || {};
    this._previousKey = key;

    if (key.name == 'escape') return;

    if (key.ctrl && key.shift) {
      switch (key.name) {
        case 'backspace':
          this._deleteLineLeft();
          break;

        case 'delete':
          this._deleteLineRight();
          break;
      }
    } else if (key.ctrl) {
      switch (key.name) {
        case 'c':
          if (this.listenerCount('SIGINT') > 0) {
            this.emit('SIGINT');
          } else {
            this.close();
          }

        case 'h':
          this._deleteLeft();
          break;

        case 'd':
          if (this.cursor === 0 && this.line.length === 0) {
            this.close();
          } else if (this.cursor < this.line.length) {
            this._deleteRight();
          }
          break;

        case 'u':
          this.cursor = 0;
          this.line = '';
          this._refreshLine();
          break;

        case 'k':
          this._deleteLineRight();
          break;

        case 'a':
          this._moveCursor(-Infinity);
          break;

        case 'e':
          this._moveCursor(+Infinity);
          break;

        case 'b':
          this._moveCursor(-1);
          break;

        case 'f':
          this._moveCursor(+1);
          break;

        case 'l':
          Readline.cursorTo(this.output, 0, 0);
          Readline.clearScreenDown(this.output);
          this._refreshLine();
          break;

        case 'n':
          this._historyNext();
          break;

        case 'p':
          this._historyPrev();
          break;

        case 'z':
          if (process.platform == 'win32') break;

          // TODO?
          break;

        case 'w':
        case 'backspace':
          this._deleteWordLeft();
          break;

        case 'delete':
          this._deleteWordRight();
          break;

        case 'left':
          this._wordLeft();
          break;

        case 'right':
          this._wordRight();
          break;
      }
    } else if (key.meta) {
      switch (key.name) {
        case 'b':
          this._wordLeft();
          break;

        case 'f':
          this._wordRight();
          break;

        case 'd':
        case 'delete':
          this._deleteWordRight();
          break;

        case 'backspace':
          this._deleteWordLeft();
          break;
      }
    } else {
      if (this._sawReturnAt && key.name !== 'enter') {
        this._sawReturnAt = 0;
      }

      switch (key.name) {
        case 'return':
          this._sawRetrnAt = Date.now();
          this._line();
          break;

        case 'enter':
          if (this._sawReturnAt === 0 || 
              Date.now() - this._sawReturnAt > this.crlfDelay) {
            this._line();
          }

          this._sawReturnAt = 0;
          break;

        case 'backspace':
          this._deleteLeft();
          break;

        case 'delete':
          this._deleteRight();
          break;

        case 'left':
          this._moveCursor(-1);
          break;

        case 'right':
          this._moveCursor(+1);
          break;

        case 'home':
          this._moveCursor(-Infinity);
          break;

        case 'end':
          this._moveCursor(+Infinity);
          break;

        case 'up':
          this._historyPrev();
          break;

        case 'down':
          this._historyNext();
          break;

        case 'tab':
          // TODO
          break;

        default:
          if (data instanceof Buffer) {
            data = data.toString('utf-8');
          }

          if (data) {
            let lines = data.split(/\r\n|\n|\r/);

            for (let i = 0, len = lines.length; i < len; i++) {
              if (i > 0) {
                this._line();
              }

              this._insertString(lines[i]);
            }
          }
      }
    }
  }

  /**
   * @private
   */
  _normalWrite (data) {
    if (data === undefined) return;

    let string = this._decoder.write(data);

    if (this._sawReturnAt && Date.now() - this._sawReturnAt <= this.crlfDelay) {
      string = string.replace(/^\n/, '');
      this._sawReturnAt = 0;
    }

    let isMultiLine = LINE_ENDING.test(string);

    if (this._line_buffer) {
      string = this._line_buffer + string;
      this._line_buffer = null;
    }

    if (isMultiLine) {
      this._sawReturnAt = string.endsWith('\r') ? Date.not() : 0;

      let lines = string.split(LINE_ENDING);

      string = lines.pop();
      this._line_buffer = string;

      lines.forEach((line) => {
        this._onLine(line);
      }, this);
    } else if (string) {
      this._line_buffer = string;
    }
  }

  /**
   * @private
   */
  _insertString (c) {
    if (this.cursor < this.line.length) {
      let start = this.line.slice(0, this.cursor);
      let end = this.line.slice(this.cursor, this.line.length);
      this.line = start + x + end;
      this.cursor += c.length;
      this._refreshLine();
    } else {
      this.line += c;
      this.cursor += c.length;

      if (this._getCursorPos().cols === 0) {
        this._refreshLine();
      } else {
        this._writeToOutput(c);
      }

      this._moveCursor(0);
    }
  }

  /**
   * Write string to output.
   *
   * @param {string} string
   */
  _writeToOutput (input) {
    if (typeof input !== 'string') {
      throw new TypeError('Not a string.');
    }

    if (this.output !== null && this.output !== undefined) {
      this.output.write(input);
    }
  }

  /**
   * Add current line to the history.
   */
  _addHistory () {
    if (this.line.length === 0) return '';
    if (this.historySize === 0) return this.line;
    if (this.line.trim().length === 0) return this.line;
    if (this.history.length === 0 || this.history[0] !== this.line) {
      this.history.unshift(this.line);
      if (this.history.length > this.historySize) this.history.pop();
    }

    this.historyIndex = -1;

    return this.history[0];
  }

  _refreshLine () {
    let line = this._prompt + this.line;
    let position = this._getDisplayPos(line);
    let cols = position.cols;
    let rows = position.rows;
    let cursor = this._getCursorPos();
    let prevRows = this.prevRows || 0;

    if (prevRows > 0) {
      Readline.moveCursor(this.output, 0, -prevRows);
    }

    Readline.cursorTo(this.output, 0);
    Readline.clearScreenDown(this.output);
    
    this._writeToOutput(line);

    if (cols === 0) {
      this._writeToOutput(' ');
    }

    Readline.cursorTo(this.output, cursor.cols);

    let diff = rows - cursor.rows;
    if (diff > 0) {
      Readline.moveCursor(this.output, 0, -diff);
    }

    this.prevRows = cursor.rows;
  }

  /**
   * Get the last character's display position of the given input
   *
   * @param {string} str
   *
   * @return {Object}
   * @property {number} cols
   * @property {number} rows
   */
  _getDisplayPos (str) {
    let offset = 0;
    let col = this.columns;
    let row = 0;
    let code;

    str = stripVTControlCharacters(str);

    for (let i = 0, len = str.length; i < len; i++) {
      code = str.codePointAt(i);

      if (code >= 0x10000) {
        i++;
      }

      if (code === 0x0a) {
        offset = 0;
        row += 1;
        continue;
      }

      if (isFullWidthCodePoint(code)) {
        if ((offset + 1) % col === 0) {
          offset++;
        }
        offset += 2;
      } else {
        offset++;
      }
    }

    let cols = offset % col;
    let rows = row + (offset - cols) / col;

    return {
      cols: cols,
      rows: rows
    }
  }

  /**
   * Get the current cursor's position and line.
   *
   * @return {Object}
   * @property {number} cols
   * @property {number} rows
   */
  _getCursorPos () {
    let columns = this.columns;
    let strBeforeCursor = this._prompt + this.line.substring(0, this.cursor);
    let dispPos = this._getDisplayPos(stripVTControlCharacters(strBeforeCursor));
    let cols = dispPos.cols;
    let rows = dispPos.rows;

    if (cols + 1 === columns &&
        this.cursor < this.line.length &&
          isFullWidthCodePoint(this.line.codePointAt(this.cursor))) {
      rows++;
      cols = 0;
    }

    return {
      cols: cols,
      rows: rows
    }
  }

  /**
   * Move cursor one word to the left
   */
  _wordLeft () {
    if (this.cursor > 0) {
      let leading = this.line.slice(0, this.cursor);
      let match = leading.match(/([^\w\s]+|\w+|)\s*$/);
      this._moveCursor(-match[0].length);
    }
  }

  /**
   * Move cursor one word to the right
   */
  _wordRight () {
    if (this.cursor < this.line.length) {
      let trailing = this.line.slice(this.cursor);
      let match = trailing.match(/^(\s+|\W+|\w+)\s*/);
      this._moveCursor(match[0].length);
    }
  }

  /**
   * Delete to the left of the cursor
   */
  _deleteLeft () {
    if (this.cursor > 0 && this.line.length > 0) {
      this.line = this.line.slice(0, this.cursor - 1) +
                  this.line.slice(this.cursor, this.line.length);

      this.cursor--;
      this._refreshLine();
    }
  }

  /**
   * Delete to the right of the cursor
   */
  _deleteRight () {
    this.line = this.line.slice(0, this.cursor) +
                this.line.slice(this.cursor + 1, this.line.length);

    this._refreshLine();
  }

  /**
   * Delete word to the left
   */
  _deleteWordLeft () {
    if (this.cursor > 0) {
      let leading = this.line.slice(0, this.cursor);
      let match = leading.match(/([^\w\s]+|\w+|)\s*$/);
      leading = leading.slice(0, leading.length - match[0].length);
      this.line = leading + this.line.slice(this.cursor, this.line.length);
      this.cursor = leading.length;
      this._refreshLine();
    }
  }

  /**
   * Delete word to the right
   */
  _deleteWordRight () {
    if (this.cursor < this.line.length) {
      let trailing = this.line.slice(this.cursor);
      let match = trailing.match(/^(\s+|\W+|\w+)\s*/);
      this.line = this.line.slice(0, this.cursor) +
                  trailing.slice(match[0].length);
      this._refreshLine();
    }
  }

  /**
   * Delete line to the left of the cursor
   */
  _deleteLineLeft () {
    this.line = this.line.slice(this.cursor);
    this.cursor = 0;
    this._refreshLine();
  }

  /**
   * Delete line to the right of the cursor
   */
  _deleteLineRight () {
    this.line = this.line.slice(0, this.cursor);
    this._refreshLine();
  }

  /**
   * Clear the current line
   */
  clearLine () {
    this._moveCursor(+Infinity);
    this._writeToOutput('\r\n');
    this.line = '';
    this.cursor = 0;
    this.prevRows = 0;
  }

  _line () {
    let line = this._addHistory();
    this.clearLine();
    this._onLine(line);
  }

  /**
   * Get the next element in the history
   *
   * @private
   */
  _historyNext () {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.line = this.history[this.historyIndex];
      this.cursor = this.line.length;
      this._refreshLine();
    } else if (this.historyIndex === 0) {
      this.historyIndex = -1;
      this.cursor = 0;
      this.line = '';
      this._refreshLine();
    }
  }

  /**
   * Get the previous element in the history
   *
   * @private
   */
  _historyPrev () {
    if (this.historyIndex + 1 < this.history.length) {
      this.historyIndex++;
      this.line = this.history[this.historyIndex];
      this.cursor = this.line.length;

      this._refreshLine();
    }
  }

  /**
   * Move the cursor x places in a direction.
   * @private
   *
   * @param {number} x
   */
  _moveCursor (x) {
    let oldCursor = this.cursor;
    let oldPos = this._getCursorPos();
    this.cursor += x;

    if (this.cursor < 0) {
      this.cursor = 0;
    } else if (this.cursor > this.line.length) {
      this.cursor = this.line.length;
    }

    let newPos = this._getCursorPos();

    if (oldPos.rows === newPos.rows) {
      let diffCursor = this.cursor - oldCursor;
      let diffWidth;

      if (diffCursor < 0) {
        diffWidth = -getStringWidth(this.line.substring(this.cursor, oldCursor));
      } else if (diffCursor > 0) {
        diffWidth = getStringWidth(this.line.substring(this.cursor, oldCursor));
      }

      Readline.moveCursor(this.ouput, diffWidth, 0);
      this.prevRows = newPos.rows;
    } else {
      this._refreshLine();
    }
  }

}


Object.defineProperty(Readline.prototype, 'columns', {
  configurable: true,
  enumerable: true,
  get: function get() {
    let columns = Infinity;
    if (this.output && this.output.columns) {
      columns = this.output.columns;
    }

    return columns
  }
});

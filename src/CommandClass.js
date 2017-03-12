import Readline from './Readline';
import { InputStream, OutputStream } from './Stream';
import { isFunction } from 'lodash';
import chalk from 'chalk';

chalk.enabled = true;

const __commands = {};

export default class CommandClass {
  constructor (hterm, config) {
    if (config == null) { config = {}; }

    this._hterm = hterm;
    this._readline = null;

    this._input = null;
    this._output = null;

    this.prompt = '> ';
  }

  run () {
    let input = new InputStream(this._hterm.io);
    let output = new OutputStream(this._hterm.io);
    let prompt = this.prompt;

    this._readline = Readline.createInterface({ input, output, prompt });
    this._readline.on('line', this.bound('onLine'));

    this._input = input;
    this._output = output;

    let result = new Promise((function (resolve) {
      this._readline.on('close', resolve);

      return this._readline.prompt();
    }.bind(this)));

    
    if (isFunction(result != null ? result.then : undefined)) {
      return result.then(() => { this._cancel(); });
    }

    return this.exit(result);
  }

  _cancel () {
    this.writeln('^C');
    this.run();
  }

  onLine (line) {
    let { cmd, args } = this.parseLine(line);

    if (cmd) {
      return this.runCommand(cmd, args);
    }

    return this._readline.prompt();
  }

  exit (code) {
    //this.exited_ = true;
    //this.options_.onExit(code);
    console.log(code);
    return this._readline.prompt();
    //return Promise.resolve(code);
  }

  bound (method) {
    return this[method].bind(this);
  }

  parseLine (line) {
    let [cmd, ...args] = Array.from(line.split(' ').map(arg => arg.trim()));

    return {
      cmd,
      args: args
    }
  }

  runCommand (cmd, args) {
    if (!(cmd in __commands)) {
      this._readline.output.write(`${cmd}: command not found\n`);
      return this._readline.prompt();
    }

    let res = new Promise((resolve) => {
      this[__commands[cmd]](args);
    });
    
    return this._readline.prompt();
  }

  writeln (input) {
    this._readline.output.write(input + '\r\n');
  }

  write (input) {
    this._readline.output.write(input);
  }

  ask (question) {
    return new Promise ((resolve) => {
      this._readline.question(question, resolve);
    });
  }

}

let add_command = (target, key) => {
  if (!key) {
    return (_target, _key) => {
      __commands[target] = _key;
    };
  }

  __commands[key] = kay;
};

export {
  CommandClass,
  add_command
};

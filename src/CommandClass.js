import Readline from './Readline';
import { InputStream, OutputStream } from './Stream';
import { isFunction } from 'lodash';
import chalk from 'chalk';
chalk.enabled = true;

const __commands = {};

export default class CommandClass {
  constructor (hterm, config) {
    if (config == null) { config = {}; }

    this.hterm = hterm;
    this.readline = null;

    this.prompt = '> ';
  }

  run () {
    let input = new InputStream(this.hterm.io);
    let output = new OutputStream(this.hterm.io);
    let prompt = this.prompt;

    this.readline = Readline.createInterface({ input, output, prompt });
    this.readline.on('line', this.bound('onLine'));

    let result = new Promise((function (resolve) {
      this.readline.on('close', resolve);

      return this.readline.prompt();
    }.bind(this)));

    
    if (isFunction(result != null ? result.then : undefined)) {
      return result.then(this.bound('exit'));
    }

    return this.exit(result);
  }

  onLine (line) {
    let { cmd, args } = this.parseLine(line);

    if (cmd) {
      return this.runCommand(cmd, args);
    }

    return this.readline.prompt();
  }

  exit (code) {
    this.exited_ = true;
    this.options_.onExit(code);

    return Promise.resolve(code);
  }

  bound (method) {
    return this[method].bind(this);
  }

  parseLine (line) {
    let [cmd, ...argv] = Array.from(line.split(' ').map(arg => arg.trim()));

    return {
      cmd,
      argString: argv.join(' ')
    }
  }

  runCommand (cmd, args) {
    if (!(cmd in __commands)) {
      this.readline.output.write(`${chalk.bold.red("error:")} command not found\n`);
      return this.readline.prompt();
    }

    // TODO
    console.log(cmd, 'exists... need to implement exec()');

    return this.readline.prompt();
  }
}

let add_command = (target, key) => {
  console.log('add_command...');
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

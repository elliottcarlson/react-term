import { CommandClass, add_command } from '../index';

export default class ExampleShell extends CommandClass {
  constructor () {
    super(...arguments);

    this.prompt = '[~] $';
  }

  @add_command('test')
  test () {
    this.writeln('test!');
  }

  @add_command('age')
  ask_for_age () {
    let res = this.ask('How old are you?');
    
    res.then((answer) => {
      this.writeln(`You are ${answer} years old!`);
    });
  }

  @add_command('args')
  argument_test (args) {
    this.writeln(args);
  }
}

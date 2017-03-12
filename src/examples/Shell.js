import { CommandClass, add_command } from '../CommandClass';

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
    this.ask('How old are you?').then((answer) => {
      this.writeln(`You are ${answer} years old!`);
    });
  }
}

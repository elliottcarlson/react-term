import { CommandClass, add_command } from '../CommandClass';

export default class ExampleShell extends CommandClass {
  constructor () {
    super(...arguments);

    this.prompt = '[~] $';
  }


  @add_command('test')
  test() {
    this.rl.output('test!\r\n');
  }
}

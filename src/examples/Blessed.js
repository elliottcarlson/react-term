import { CommandClass, add_command } from '../CommandClass';
import blessed from 'blessed';

export default class ExampleBlessed extends CommandClass {
  constructor () {
    super(...arguments);

    this.prompt = '*';

    this.screen = blessed.screen({
      input: this._input,
      output: this._output
    });
  }


  @add_command('test')
  test() {
    let box = blessed.box({
      top: 'center',
      left: 'center',
      width: '50%',
      height: '50%',
      content: 'Hello {bold}world{/bold}!',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'magenta',
        border: {
          fg: '#f0f0f0'
        },
        hover: {
          bg: 'green'
        }
      }
    });

    this.screen.append(box);

    this.screen.render();
  }
}

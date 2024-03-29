import React from 'react';
import { hterm, lib } from 'hterm-umdjs';

class Terminal extends React.Component {
  componentDidMount () {
    hterm.defaultStorage = new lib.Storage.Local();
    hterm.Terminal.prototype.overlaySize = function () {};

    const { commandClass } = this.props;
    const terminal = new hterm.Terminal();
    window.terminal = terminal;

    terminal.onTerminalReady = () => {
      terminal.setCursorPosition(0, 0);
      terminal.setCursorVisible(true);
      terminal.setCursorShape(hterm.Terminal.cursorShape.BEAM);
      terminal.setCursorColor('white');

      terminal.getPrefs().set('ctrl-c-copy', true);
      terminal.getPrefs().set('ctrl-v-paste', true);
      terminal.getPrefs().set('use-default-window-copy', true);

      terminal.getPrefs().set('background-color', '#282c34');
      terminal.getPrefs().set('foreground-color', '#abb2bf');
      terminal.getPrefs().set('cursor-blink', true);

      let prompt = '>';

      terminal.runCommandClass(commandClass, { prompt });
    };

    terminal.decorate(this.terminalContainer);
    terminal.installKeyboard();
  }

  render () {
    return (
      <div ref={div => this.terminalContainer = div}>
      </div>
    );
  }
}

Terminal.propTypes = {
  commandClass: React.PropTypes.func.isRequired
};

export default Terminal;

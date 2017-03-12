import React from 'react';
import { storiesOf, action } from '@kadira/storybook';
import Terminal from '../Terminal';

import ExampleShell from '../examples/Shell';

storiesOf('Terminal', module)
  .add('default view', () => (
    <Terminal
      name={name}
      commandClass={ExampleShell}
    />
  ));
